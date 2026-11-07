from typing import Any
from uuid import UUID

from pydantic_ai import RunContext
from sqlalchemy import select

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import AutonomyLevel, OutreachMessageStatus, TriggerMatchStatus
from app.modules.outreach.commands import ReviewMessageCommand
from app.modules.outreach.service import OutreachService
from app.modules.strategist.models import StrategistState
from app.modules.triggers.commands import ReviewMatchCommand
from app.modules.triggers.service import TriggerService


@marketing_agent.tool
async def request_human_approval(
    ctx: RunContext[AgentDeps],
    action_type: str,
    title: str,
    description: str,
    entity_id: str | None = None,
    badge_label: str = "Human Review Gate",
    action_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Checks autonomy policy. If in 'staged_review', halts for human approval.
    If in 'full_auto', immediately auto-approves the entity in the database.
    """
    async with ctx.deps.db_session_scope() as db:
        res = await db.execute(select(StrategistState).order_by(StrategistState.created_at.desc()).limit(1))
        state = res.scalars().first()
        is_full_auto = state is not None and state.autonomy_level == AutonomyLevel.FULL_AUTO

        if is_full_auto:
            # Auto-approve in database so background dispatchers send automatically
            if action_type == "outreach_dm" and entity_id:
                outreach_service = OutreachService(db)
                await outreach_service.review_message(
                    ReviewMessageCommand(
                        message_id=UUID(entity_id),
                        status=OutreachMessageStatus.APPROVED,
                    )
                )
            elif action_type == "trigger_reply" and entity_id:
                trigger_service = TriggerService(db)
                await trigger_service.review_match(
                    ReviewMatchCommand(
                        match_id=UUID(entity_id),
                        status=TriggerMatchStatus.APPROVED,
                    )
                )

            return {
                "approval_required": False,
                "auto_approved": True,
                "action_type": action_type,
                "title": title,
                "description": description,
                "entity_id": entity_id,
                "status": "auto_approved_by_policy",
            }

    # Staged review mode: requires human sign-off
    return {
        "approval_required": True,
        "auto_approved": False,
        "action_type": action_type,
        "title": title,
        "description": description,
        "entity_id": entity_id,
        "badge_label": badge_label,
        "action_payload": action_payload or {},
        "status": "awaiting_user_decision",
    }
