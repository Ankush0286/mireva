from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import AutonomyLevel, ChatRole, StrategistStatus
from app.modules.copilot.commands import CreateChatSessionCommand
from app.modules.copilot.models import ChatMessage, ToolExecutionLog
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


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


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
        state.current_step = (
            f"Resting for {clamped_minutes}m until {wake_time.strftime('%H:%M UTC')}"
        )
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

    async def set_model(self, model_id: str) -> StrategistState:
        state = await self.get_or_create_state()
        state.model_id = model_id.strip()
        await self.db.commit()
        await self.db.refresh(state)
        return state

    async def clear_context_and_logs(self) -> StrategistState:
        """Wipes all monologue messages and tool logs to reset the agent's context window."""
        state = await self.get_or_create_state()
        if state.session_id:
            await self.db.execute(
                delete(ToolExecutionLog).where(ToolExecutionLog.session_id == state.session_id)
            )
            await self.db.execute(
                delete(ChatMessage).where(ChatMessage.session_id == state.session_id)
            )

        state.cycle_count = 0
        state.pending_question = None
        state.pending_urgency = None
        state.pending_context = {}
        state.current_step = "Context memory cleared. Ready for fresh cycle."
        if state.status == StrategistStatus.WAITING_FOR_HUMAN:
            state.status = StrategistStatus.IDLE

        await self.db.commit()
        await self.db.refresh(state)
        return state

    async def delete_cycle_briefing(self, message_id: UUID | str) -> StrategistState:
        """Deletes a specific cycle briefing message, its tool logs, and its preceding wake prompt."""
        target_msg_id = _ensure_uuid(message_id)
        state = await self.get_or_create_state()
        if not state.session_id:
            return state

        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == state.session_id)
            .order_by(ChatMessage.created_at.asc())
        )
        res = await self.db.execute(stmt)
        all_msgs = list(res.scalars().all())

        ids_to_delete: list[UUID] = []
        for idx, msg in enumerate(all_msgs):
            if msg.id == target_msg_id:
                ids_to_delete.append(msg.id)
                # Also remove the preceding automatic wake-up user prompt for this cycle
                if idx > 0 and all_msgs[idx - 1].role == ChatRole.USER:
                    ids_to_delete.append(all_msgs[idx - 1].id)
                break

        if ids_to_delete:
            await self.db.execute(
                delete(ToolExecutionLog).where(ToolExecutionLog.message_id.in_(ids_to_delete))
            )
            await self.db.execute(delete(ChatMessage).where(ChatMessage.id.in_(ids_to_delete)))
            state.cycle_count = max(0, state.cycle_count - 1)
            await self.db.commit()
            await self.db.refresh(state)

        return state
