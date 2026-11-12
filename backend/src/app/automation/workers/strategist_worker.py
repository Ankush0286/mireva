import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agent.loop import run_agent_turn
from app.common.enums import (
    AutonomyLevel,
    OutreachMessageStatus,
    StrategistStatus,
    TriggerMatchStatus,
)
from app.core.agent_config import agent_settings
from app.db.session import async_session_factory
from app.modules.outreach.models import OutreachMessage
from app.modules.strategist.models import StrategistState
from app.modules.strategist.service import StrategistService
from app.modules.triggers.models import TriggerMatch

logger = logging.getLogger(__name__)

_active_cycle_task: asyncio.Task[Any] | None = None

AUTONOMOUS_CYCLE_PROMPT = """
You are waking up for your scheduled autonomous growth cycle.
Execute your 5-step growth loop:

1. WAKE UP & EVALUATE:
   - Call `evaluate_marketing_performance` to inspect recent post conversions, account quotas, pipeline health, and human review outcomes.
   - Review the HUMAN REVIEW QUEUE OUTCOMES below: note which of your previous staged DMs or replies were APPROVED by the human, which were REJECTED/DISMISSED (adapt your copy angle accordingly), and which are STILL PENDING (do NOT stage duplicate DMs to leads already awaiting review).

2. STRATEGY SYNTHESIS:
   - Call `get_brand_knowledge` to anchor positioning, personas, and banned words.
   - Query `get_search_console_opportunities` or `get_competitor_keyword_gaps` if connectors exist.

3. EXECUTE TARGETED ACTIONS:
   - If account quotas allow, draft or queue 1-2 high-hook posts via `queue_social_post`.
   - If new opportunities exist, stage a personalized DM via `stage_cold_outreach_dm` or add a lead via `add_lead_to_crm`.

4. CLOSE THE CYCLE:
   - If you encounter a fatal blocker requiring user input, call `ask_human_for_help`.
   - Otherwise, summarize your actions concisely in markdown and conclude by calling `sleep(duration_minutes, rationale)` (between 30 and 180 minutes).
""".strip()


async def _build_review_digest(db: AsyncSession) -> str:
    """Compiles a summary of human review decisions since the previous cycle."""
    dms_res = await db.execute(
        select(OutreachMessage)
        .options(selectinload(OutreachMessage.lead))
        .order_by(OutreachMessage.updated_at.desc())
        .limit(12)
    )
    recent_dms = list(dms_res.scalars().all())

    matches_res = await db.execute(
        select(TriggerMatch).order_by(TriggerMatch.updated_at.desc()).limit(10)
    )
    recent_matches = list(matches_res.scalars().all())

    approved_dms = [
        f"@{d.lead.handle}"
        for d in recent_dms
        if d.lead and d.status in (OutreachMessageStatus.APPROVED, OutreachMessageStatus.DISPATCHED)
    ]
    rejected_dms = [
        f"@{d.lead.handle} (Reason: {d.last_error_message or 'Dismissed by operator'})"
        for d in recent_dms
        if d.lead and d.status == OutreachMessageStatus.REJECTED
    ]
    pending_dms = [
        f"@{d.lead.handle}"
        for d in recent_dms
        if d.lead and d.status == OutreachMessageStatus.STAGED
    ]

    approved_matches = [
        f"@{m.author_handle}"
        for m in recent_matches
        if m.status in (TriggerMatchStatus.APPROVED, TriggerMatchStatus.DISPATCHED)
    ]
    ignored_matches = [
        f"@{m.author_handle}" for m in recent_matches if m.status == TriggerMatchStatus.IGNORED
    ]
    pending_matches = [
        f"@{m.author_handle}"
        for m in recent_matches
        if m.status == TriggerMatchStatus.PENDING_REVIEW
    ]

    lines = ["=== HUMAN REVIEW QUEUE OUTCOMES ==="]
    lines.append(
        f"- Approved & Dispatched Cold DMs ({len(approved_dms)}): {', '.join(approved_dms) or 'None'}"
    )
    lines.append(
        f"- Rejected / Dismissed Cold DMs ({len(rejected_dms)}): {', '.join(rejected_dms) or 'None'}"
    )
    lines.append(
        f"- Still Pending in Review Queue ({len(pending_dms)} DMs): {', '.join(pending_dms) or 'None'} (Do NOT duplicate these)"
    )
    lines.append(
        f"- Approved Trigger Auto-Replies ({len(approved_matches)}): {', '.join(approved_matches) or 'None'}"
    )
    lines.append(
        f"- Ignored Trigger Matches ({len(ignored_matches)}): {', '.join(ignored_matches) or 'None'}"
    )
    lines.append(
        f"- Pending Trigger Matches ({len(pending_matches)}): {', '.join(pending_matches) or 'None'}"
    )
    return "\n".join(lines)


def cancel_active_cycle() -> bool:
    """Cancels the currently running autonomous cycle task if one is in flight."""
    global _active_cycle_task
    if _active_cycle_task is not None and not _active_cycle_task.done():
        _active_cycle_task.cancel()
        return True
    return False


async def execute_autonomous_cycle(
    db: AsyncSession,
    state: StrategistState | None = None,
) -> bool:
    """Executes a single autonomous marketing turn inside the dedicated ChatSession."""
    global _active_cycle_task
    _active_cycle_task = asyncio.current_task()

    service = StrategistService(db)
    active_state = state or await service.get_or_create_state()

    if not active_state.session_id:
        return False

    logger.info("🧠 Autonomous Strategist waking up for cycle execution...")

    active_state.status = StrategistStatus.RUNNING
    active_state.current_step = "Waking up: evaluating marketing telemetry & review outcomes..."
    active_state.last_cycle_started_at = datetime.now(UTC)
    await db.commit()

    autonomy_directive = (
        "CURRENT AUTONOMY LEVEL: FULL AUTO. You are fully authorized to execute actions directly. "
        "DMs and posts will be automatically dispatched within daily rate limits. Do NOT wait for human approval."
        if active_state.autonomy_level == AutonomyLevel.FULL_AUTO
        else "CURRENT AUTONOMY LEVEL: STAGED REVIEW. All outbound DMs, posts, and replies must be staged for human review. "
        "Call `request_human_approval` for any outbound action so it appears in the operator's review queue."
    )

    review_digest = await _build_review_digest(db)
    cycle_prompt = (
        f"{AUTONOMOUS_CYCLE_PROMPT}\n\n{review_digest}\n\nPOLICY NOTICE:\n{autonomy_directive}"
    )

    try:
        active_model = active_state.model_id or agent_settings.DEFAULT_MODEL
        await run_agent_turn(
            db=db,
            session_id=active_state.session_id,
            user_prompt=cycle_prompt,
            model_override=active_model,
            thinking=True,
        )

        await db.refresh(active_state)

        # Synchronize cycle count directly with verified completed assistant turns
        await service._sync_cycle_count(active_state)

        if active_state.status == StrategistStatus.PAUSED:
            logger.info("⏸️ Cycle finished, keeping operator PAUSED state.")
            return False

        if active_state.status == StrategistStatus.RUNNING:
            active_state.status = StrategistStatus.SLEEPING
            active_state.next_cycle_at = datetime.now(UTC) + timedelta(minutes=60)
            active_state.sleep_rationale = (
                "Completed autonomous evaluation cycle. Resting 60m before next check."
            )
            active_state.current_step = "Resting until next scheduled cycle."
            active_state.last_cycle_completed_at = datetime.now(UTC)
            await db.commit()

        logger.info(
            "✅ Autonomous Strategist finished cycle. Verified completed: %d. Status: %s",
            active_state.cycle_count,
            active_state.status.value,
        )
        return True

    except asyncio.CancelledError:
        logger.info("⏸️ Autonomous cycle cancelled by operator pause.")
        await db.rollback()
        paused_state = await service.get_or_create_state()
        paused_state.status = StrategistStatus.PAUSED
        paused_state.next_cycle_at = None
        paused_state.current_step = "Autonomous background execution paused by operator."
        await db.commit()
        await service._sync_cycle_count(paused_state)
        return False

    except Exception as exc:
        logger.error("Error in autonomous strategist turn: %s", exc, exc_info=True)
        await db.rollback()
        refreshed = await service.get_or_create_state()
        if refreshed.status != StrategistStatus.PAUSED:
            refreshed.status = StrategistStatus.SLEEPING
            refreshed.next_cycle_at = datetime.now(UTC) + timedelta(minutes=30)
            refreshed.sleep_rationale = f"Cycle error ({exc}). Retrying in 30 minutes."
            refreshed.current_step = "Recovering from error; scheduled retry in 30m."
            await db.commit()
        await service._sync_cycle_count(refreshed)
        return False

    finally:
        _active_cycle_task = None


async def run_strategist_heartbeat(db: AsyncSession | None = None) -> int:
    """
    Periodic heartbeat worker invoked by APScheduler every 60 seconds.
    Returns 1 if a cycle was executed, 0 otherwise.
    """
    owns_session = db is None
    session = db if db is not None else async_session_factory()

    try:
        service = StrategistService(session)
        state = await service.get_or_create_state()

        if state.status in (
            StrategistStatus.PAUSED,
            StrategistStatus.WAITING_FOR_HUMAN,
            StrategistStatus.RUNNING,
        ):
            return 0

        if state.is_due_to_wake():
            ran = await execute_autonomous_cycle(session, state)
            return 1 if ran else 0

        return 0

    finally:
        if owns_session:
            await session.close()
