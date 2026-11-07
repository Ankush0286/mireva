import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.loop import run_agent_turn
from app.common.enums import AutonomyLevel, StrategistStatus
from app.core.agent_config import agent_settings
from app.db.session import async_session_factory
from app.modules.strategist.models import StrategistState
from app.modules.strategist.service import StrategistService

logger = logging.getLogger(__name__)

_active_cycle_task: asyncio.Task[Any] | None = None

AUTONOMOUS_CYCLE_PROMPT = """
You are waking up for your scheduled autonomous growth cycle.
Execute your 5-step growth loop:

1. WAKE UP & EVALUATE:
   - Call `evaluate_marketing_performance` to inspect recent post conversions, account quotas, and pipeline health.

2. STRATEGY SYNTHESIS:
   - Call `get_brand_knowledge` to anchor positioning, personas, and banned words.
   - Query `get_search_console_opportunities` or `get_competitor_keyword_gaps` if connectors exist.

3. EXECUTE TARGETED ACTIONS:
   - If account quotas allow, draft or queue 1-2 high-hook posts via `queue_social_post`.
   - If opportunities exist, stage a personalized DM via `stage_cold_outreach_dm` or add a lead via `add_lead_to_crm`.

4. CLOSE THE CYCLE:
   - If you encounter a fatal blocker requiring user input, call `ask_human_for_help`.
   - Otherwise, summarize your actions concisely in markdown and conclude by calling `sleep(duration_minutes, rationale)` (between 30 and 180 minutes).
""".strip()


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

    logger.info(
        "🧠 Autonomous Strategist waking up for Cycle #%d...",
        active_state.cycle_count + 1,
    )

    active_state.status = StrategistStatus.RUNNING
    active_state.current_step = "Waking up: evaluating marketing telemetry & brand positioning..."
    active_state.last_cycle_started_at = datetime.now(UTC)
    active_state.cycle_count += 1
    await db.commit()

    try:
        active_model = active_state.model_id or agent_settings.DEFAULT_MODEL

        # Dynamic prompt based on autonomy level
        autonomy_directive = (
            "CURRENT AUTONOMY LEVEL: FULL AUTO. You are fully authorized to execute actions directly. "
            "DMs and posts will be automatically dispatched within daily rate limits. Do NOT wait for human approval."
            if active_state.autonomy_level == AutonomyLevel.FULL_AUTO
            else "CURRENT AUTONOMY LEVEL: STAGED REVIEW. All outbound DMs, posts, and replies must be staged for human review. "
            "Call `request_human_approval` for any outbound action so it appears in the operator's review queue."
        )

        cycle_prompt = f"{AUTONOMOUS_CYCLE_PROMPT}\n\nPOLICY NOTICE:\n{autonomy_directive}"

        await run_agent_turn(
            db=db,
            session_id=active_state.session_id,
            user_prompt=cycle_prompt,
            model_override=active_model,
            thinking=True,
        )

        await db.refresh(active_state)

        # If operator paused the agent while the cycle was running, respect the PAUSED state
        if active_state.status == StrategistStatus.PAUSED:
            logger.info(
                "⏸️ Cycle #%d finished, keeping operator PAUSED state.", active_state.cycle_count
            )
            return False

        # Fallback sleep if the agent completed its turn without calling `sleep` or `ask_human_for_help`
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
            "✅ Autonomous Strategist finished Cycle #%d. Status: %s",
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
