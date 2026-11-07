from typing import Any

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent


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
    Displays an interactive Approval Card to the user in the chat UI.
    Call this tool whenever you want explicit sign-off before executing outbound actions
    (sending a cold DM, publishing a live post, or approving an auto-reply).
    """
    _ = ctx
    return {
        "approval_required": True,
        "action_type": action_type,
        "title": title,
        "description": description,
        "entity_id": entity_id,
        "badge_label": badge_label,
        "action_payload": action_payload or {},
        "status": "awaiting_user_decision",
    }
