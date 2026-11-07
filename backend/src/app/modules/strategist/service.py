from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import AutonomyLevel, StrategistStatus
from app.modules.copilot.commands import CreateChatSessionCommand
from app.modules.copilot.service import CopilotService
from app.modules.strategist.commands import (
    RecordHumanBlockerCommand,
    RecordSleepCommand,
    UpdateAutonomyCommand,
)
from app.modules.strategist.exceptions import (
    StrategistAlreadyRunningError,
    StrategistNotWaitingForHumanError,
    StrategistStateNotFoundError,
)
from app.modules.strategist.models import StrategistState


class StrategistService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_state(self) -> StrategistState:
        stmt = select(StrategistState).order_by(StrategistState.created_at.desc()).limit(1)
        result = await self.db.execute(stmt)
        state = result.scalars().first()

        if state is not None:
            if state.session_id is None:
                copilot_service = CopilotService(self.db)
                session = await copilot_service.create_session(
                    CreateChatSessionCommand(
                        title="🧠 24/7 Head of Growth Monologue",
                        system_prompt_override=(
                            "You are the 24/7 Autonomous Head of Growth. "
                            "You proactively evaluate metrics, draft content, scout creators, "
                            "and manage your own sleep/wake schedule."
                        ),
                    )
                )
                state.session_id = session.id
                await self.db.commit()
                await self.db.refresh(state)
            return state

        copilot_service = CopilotService(self.db)
        session = await copilot_service.create_session(
            CreateChatSessionCommand(
                title="🧠 24/7 Head of Growth Monologue",
                system_prompt_override=(
                    "You are the 24/7 Autonomous Head of Growth. "
                    "You proactively evaluate metrics, draft content, scout creators, "
                    "and manage your own sleep/wake schedule."
                ),
            )
        )

        new_state = StrategistState(
            status=StrategistStatus.IDLE,
            session_id=session.id,
            current_step="System initialized. Waiting for first cycle.",
        )
        self.db.add(new_state)
        await self.db.commit()
        await self.db.refresh(new_state)
        return new_state

    async def ensure_can_start_cycle(self) -> StrategistState:
        state = await self.get_or_create_state()
        if state.status == StrategistStatus.RUNNING:
            raise StrategistAlreadyRunningError()
        if not state.session_id:
            raise StrategistStateNotFoundError("session_id")
        return state

    async def record_sleep(
        self,
        duration_minutes: int,
        rationale: str,
    ) -> StrategistState:
        cmd = RecordSleepCommand(duration_minutes=duration_minutes, rationale=rationale)
        clamped_minutes = max(30, min(180, cmd.duration_minutes))
        wake_time = datetime.now(UTC) + timedelta(minutes=clamped_minutes)

        state = await self.get_or_create_state()
        state.status = StrategistStatus.SLEEPING
        state.next_cycle_at = wake_time
        state.sleep_rationale = cmd.rationale.strip()
        state.current_step = f"Resting for {clamped_minutes}m until {wake_time.strftime('%H:%M UTC')}"
        state.last_cycle_completed_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(state)
        return state

    async def record_human_blocker(
        self,
        urgency: str,
        question: str,
        context: dict[str, Any] | None = None,
    ) -> StrategistState:
        cmd = RecordHumanBlockerCommand(
            urgency=urgency,
            question=question,
            context=context or {},
        )
        state = await self.get_or_create_state()
        state.status = StrategistStatus.WAITING_FOR_HUMAN
        state.pending_question = cmd.question.strip()
        state.pending_urgency = cmd.urgency.lower().strip()
        state.pending_context = cmd.context
        state.current_step = f"Waiting for human reply: {cmd.question[:60]}"

        await self.db.commit()
        await self.db.refresh(state)
        return state

    async def prepare_human_reply(self) -> tuple[StrategistState, str]:
        state = await self.get_or_create_state()
        if state.status != StrategistStatus.WAITING_FOR_HUMAN:
            raise StrategistNotWaitingForHumanError(state.status.value)
        if not state.session_id:
            raise StrategistStateNotFoundError("session_id")

        question = state.pending_question or "Strategic fork"
        state.status = StrategistStatus.RUNNING
        state.pending_question = None
        state.pending_urgency = None
        state.pending_context = {}
        state.current_step = "Processing operator guidance..."
        await self.db.commit()
        return state, question

    async def toggle_pause(self) -> StrategistState:
        state = await self.get_or_create_state()
        if state.status == StrategistStatus.PAUSED:
            state.status = StrategistStatus.IDLE
            state.next_cycle_at = datetime.now(UTC)
            state.current_step = "Autonomy resumed. Ready for next cycle."
        else:
            state.status = StrategistStatus.PAUSED
            state.next_cycle_at = None
            state.current_step = "Autonomous background execution paused by operator."

        await self.db.commit()
        await self.db.refresh(state)
        return state

    async def set_autonomy_level(self, level: AutonomyLevel) -> StrategistState:
        cmd = UpdateAutonomyCommand(autonomy_level=level)
        state = await self.get_or_create_state()
        state.autonomy_level = cmd.autonomy_level
        await self.db.commit()
        await self.db.refresh(state)
        return state
