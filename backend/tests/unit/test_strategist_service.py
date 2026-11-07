from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import AutonomyLevel, ChatRole, StrategistStatus
from app.modules.copilot.commands import (
    AddChatMessageCommand,
    LogToolExecutionCommand,
)
from app.modules.copilot.service import CopilotService
from app.modules.strategist.exceptions import (
    StrategistAlreadyRunningError,
    StrategistNotWaitingForHumanError,
)
from app.modules.strategist.service import StrategistService


@pytest.mark.anyio
async def test_get_or_create_state_creates_singleton_and_session(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)

    state1 = await service.get_or_create_state()
    assert state1.id is not None
    assert state1.status == StrategistStatus.IDLE
    assert state1.autonomy_level == AutonomyLevel.STAGED_REVIEW
    assert state1.session_id is not None
    assert state1.cycle_count == 0

    state2 = await service.get_or_create_state()
    assert state2.id == state1.id
    assert state2.session_id == state1.session_id


@pytest.mark.anyio
async def test_set_model_and_autonomy_level(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    updated_model = await service.set_model("nvidia/nemotron-3-ultra-550b-a55b:free")
    assert updated_model.model_id == "nvidia/nemotron-3-ultra-550b-a55b:free"

    updated_autonomy = await service.set_autonomy_level(AutonomyLevel.FULL_AUTO)
    assert updated_autonomy.autonomy_level == AutonomyLevel.FULL_AUTO


@pytest.mark.anyio
async def test_record_sleep_clamps_duration_and_sets_wake_time(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)

    # Below 30m clamps to 30m
    state = await service.record_sleep(duration_minutes=5, rationale="Quick nap")
    assert state.status == StrategistStatus.SLEEPING
    assert state.sleep_rationale == "Quick nap"
    assert state.next_cycle_at is not None
    assert "30m" in (state.current_step or "")
    assert state.is_due_to_wake() is False

    # Above 180m clamps to 180m
    state_max = await service.record_sleep(duration_minutes=600, rationale="Long rest")
    assert "180m" in (state_max.current_step or "")

    # Past wake time -> is_due_to_wake() becomes True
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

    unblocked, question = await service.prepare_human_reply()
    assert question == "Instagram session expired. Please re-authenticate @brand."
    assert unblocked.status == StrategistStatus.RUNNING
    assert unblocked.pending_question is None
    assert unblocked.pending_urgency is None
    assert unblocked.pending_context == {}


@pytest.mark.anyio
async def test_strategist_conflict_exceptions(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)
    state = await service.get_or_create_state()

    with pytest.raises(StrategistNotWaitingForHumanError):
        await service.prepare_human_reply()

    state.status = StrategistStatus.RUNNING
    await db_session.commit()

    with pytest.raises(StrategistAlreadyRunningError):
        await service.ensure_can_start_cycle()


@pytest.mark.anyio
async def test_toggle_pause(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)

    paused = await service.toggle_pause()
    assert paused.status == StrategistStatus.PAUSED
    assert paused.next_cycle_at is None

    resumed = await service.toggle_pause()
    assert resumed.status == StrategistStatus.IDLE
    assert resumed.next_cycle_at is not None


@pytest.mark.anyio
async def test_clear_context_and_delete_single_cycle_briefing(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)
    copilot_service = CopilotService(db_session)
    state = await service.get_or_create_state()
    assert state.session_id is not None

    # Cycle #1
    u1 = await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=state.session_id,
            role=ChatRole.USER,
            content="Cycle 1 Wake Prompt",
        )
    )
    a1 = await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=state.session_id,
            role=ChatRole.ASSISTANT,
            content="Cycle 1 Briefing",
        )
    )
    await copilot_service.log_tool_execution(
        LogToolExecutionCommand(
            session_id=state.session_id,
            message_id=a1.id,
            tool_name="sleep",
            input_arguments={"duration_minutes": 60},
        )
    )

    # Cycle #2
    await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=state.session_id,
            role=ChatRole.USER,
            content="Cycle 2 Wake Prompt",
        )
    )
    a2 = await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=state.session_id,
            role=ChatRole.ASSISTANT,
            content="Cycle 2 Briefing",
        )
    )
    state.cycle_count = 2
    await db_session.commit()

    # 1. Delete single cycle briefing (Cycle #1)
    await service.delete_cycle_briefing(a1.id)
    remaining_msgs = await copilot_service.list_messages(state.session_id)
    assert len(remaining_msgs) == 2
    assert remaining_msgs[1].id == a2.id
    assert u1.id not in [m.id for m in remaining_msgs]
    assert state.cycle_count == 1

    # 2. Clear entire context and logs
    cleared_state = await service.clear_context_and_logs()
    assert cleared_state.cycle_count == 0
    assert len(await copilot_service.list_messages(state.session_id)) == 0
    assert len(await copilot_service.list_tool_executions(state.session_id)) == 0
