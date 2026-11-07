import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import AgentDeps
from app.agent.tools.approval_tools import request_human_approval
from app.agent.tools.autonomous_tools import (
    ask_human_for_help,
    evaluate_marketing_performance,
    sleep,
)
from app.common.enums import AutonomyLevel, PlatformType, StrategistStatus
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.service import AccountService
from app.modules.copilot.commands import AddChatMessageCommand, CreateChatSessionCommand
from app.modules.copilot.models import ChatRole
from app.modules.copilot.service import CopilotService
from app.modules.strategist.exceptions import (
    StrategistAlreadyRunningError,
    StrategistNotWaitingForHumanError,
)
from app.modules.strategist.service import StrategistService


def _make_run_context(db_session: AsyncSession) -> Any:
    """Constructs a lightweight RunContext mock carrying AgentDeps."""
    ctx = MagicMock()
    lock = asyncio.Lock()
    ctx.deps = AgentDeps(db=db_session, _async_lock=lock)

    @asynccontextmanager
    async def mock_scope() -> AsyncGenerator[AsyncSession, None]:
        async with lock:
            yield db_session

    ctx.deps.db_session_scope = mock_scope
    return ctx


# =============================================================================
# StrategistService Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_get_or_create_state_creates_singleton_and_session(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    state1 = await service.get_or_create_state()
    assert state1.id is not None
    assert state1.status == StrategistStatus.IDLE
    assert state1.autonomy_level == AutonomyLevel.STAGED_REVIEW
    assert state1.session_id is not None
    assert state1.cycle_count == 0

    # Subsequent calls return the exact same singleton state
    state2 = await service.get_or_create_state()
    assert state2.id == state1.id
    assert state2.session_id == state1.session_id


@pytest.mark.anyio
async def test_record_sleep_clamps_duration_and_sets_wake_time(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    # 1. Below minimum (<30m) is clamped to 30m
    state = await service.record_sleep(duration_minutes=5, rationale="Quick nap")
    assert state.status == StrategistStatus.SLEEPING
    assert state.sleep_rationale == "Quick nap"
    assert state.next_cycle_at is not None
    assert "30m" in (state.current_step or "")
    assert state.is_due_to_wake() is False

    # 2. Above maximum (>180m) is clamped to 180m
    state_max = await service.record_sleep(duration_minutes=600, rationale="Long rest")
    assert "180m" in (state_max.current_step or "")

    # 3. Artificially age next_cycle_at into the past -> is_due_to_wake() becomes True
    state_max.next_cycle_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()
    assert state_max.is_due_to_wake() is True


@pytest.mark.anyio
async def test_record_and_prepare_human_blocker(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    blocked = await service.record_human_blocker(
        urgency="high",
        question="Instagram session expired. Please re-authenticate @brand.",
        context={"account": "brand"},
    )
    assert blocked.status == StrategistStatus.WAITING_FOR_HUMAN
    assert blocked.pending_urgency == "high"
    assert blocked.pending_question == "Instagram session expired. Please re-authenticate @brand."
    assert blocked.pending_context == {"account": "brand"}

    # Prepare human reply clears the blocker and transitions to RUNNING
    unblocked, question = await service.prepare_human_reply()
    assert question == "Instagram session expired. Please re-authenticate @brand."
    assert unblocked.status == StrategistStatus.RUNNING
    assert unblocked.pending_question is None
    assert unblocked.pending_urgency is None
    assert unblocked.pending_context == {}


@pytest.mark.anyio
async def test_prepare_human_reply_when_not_waiting_raises_conflict(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)
    await service.get_or_create_state()

    with pytest.raises(StrategistNotWaitingForHumanError):
        await service.prepare_human_reply()


@pytest.mark.anyio
async def test_ensure_can_start_cycle_when_running_raises_conflict(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)
    state = await service.get_or_create_state()
    state.status = StrategistStatus.RUNNING
    await db_session.commit()

    with pytest.raises(StrategistAlreadyRunningError):
        await service.ensure_can_start_cycle()


@pytest.mark.anyio
async def test_toggle_pause_and_set_autonomy_level(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    # Pause
    paused = await service.toggle_pause()
    assert paused.status == StrategistStatus.PAUSED
    assert paused.next_cycle_at is None

    # Resume
    resumed = await service.toggle_pause()
    assert resumed.status == StrategistStatus.IDLE
    assert resumed.next_cycle_at is not None

    # Set autonomy level
    updated = await service.set_autonomy_level(AutonomyLevel.FULL_AUTO)
    assert updated.autonomy_level == AutonomyLevel.FULL_AUTO


# =============================================================================
# Autonomous & Approval Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_autonomous_and_approval_tools_execution(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    await acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="strategist_bot")
    )

    # 1. evaluate_marketing_performance tool
    perf = await evaluate_marketing_performance(ctx)
    assert "connected_accounts" in perf
    assert len(perf["connected_accounts"]) == 1
    assert perf["connected_accounts"][0]["handle"] == "strategist_bot"
    assert "posts_last_7_days" in perf
    assert "crm_summary" in perf

    # 2. request_human_approval tool
    approval = await request_human_approval(
        ctx,
        action_type="outreach_dm",
        title="Send DM to @founder?",
        description="Hey @founder, love your work!",
        entity_id="12345",
        badge_label="Cold DM Review",
    )
    assert approval["approval_required"] is True
    assert approval["action_type"] == "outreach_dm"
    assert approval["status"] == "awaiting_user_decision"

    # 3. sleep tool
    sleep_res = await sleep(ctx, duration_minutes=45, rationale="Resting until peak hours.")
    assert sleep_res["status"] == "sleeping"
    assert sleep_res["duration_minutes"] == 45
    assert sleep_res["rationale"] == "Resting until peak hours."

    # 4. ask_human_for_help tool
    help_res = await ask_human_for_help(
        ctx,
        urgency="medium",
        question="Which persona should we prioritize this week?",
        context={"options": ["Founders", "Agencies"]},
    )
    assert help_res["status"] == "waiting_for_human"
    assert help_res["urgency"] == "medium"


# =============================================================================
# Copilot Message Truncation (Edit & Resend / Retry) Unit Test
# =============================================================================


@pytest.mark.anyio
async def test_delete_messages_from_truncates_subsequent_turns(db_session: AsyncSession) -> None:
    copilot_service = CopilotService(db_session)
    session = await copilot_service.create_session(CreateChatSessionCommand(title="Edit Test"))

    m1 = await copilot_service.add_message(
        AddChatMessageCommand(session_id=session.id, role=ChatRole.USER, content="Turn 1 User")
    )
    await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session.id, role=ChatRole.ASSISTANT, content="Turn 1 Assistant"
        )
    )
    m3 = await copilot_service.add_message(
        AddChatMessageCommand(session_id=session.id, role=ChatRole.USER, content="Turn 2 User")
    )
    await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session.id, role=ChatRole.ASSISTANT, content="Turn 2 Assistant"
        )
    )

    # Delete from m3 onwards (prunes Turn 2 User and Turn 2 Assistant)
    deleted_ids = await copilot_service.delete_messages_from(session.id, m3.id)
    assert len(deleted_ids) == 2

    remaining = await copilot_service.list_messages(session.id)
    assert len(remaining) == 2
    assert remaining[0].id == m1.id
    assert remaining[1].content == "Turn 1 Assistant"
