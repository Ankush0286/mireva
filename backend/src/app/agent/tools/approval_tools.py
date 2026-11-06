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
    Halts execution and displays an interactive Approval Card to the user in the chat UI.
    Call this tool whenever you want the user's explicit sign-off before executing 
    outbound actions (e.g. sending a cold DM, publishing a live tweet, deleting data).

    Args:
        action_type: One of 'outreach_dm', 'publish_post', 'trigger_reply', or 'general'
        title: Short, direct headline (e.g. 'Send cold outreach DM to @alex_dev?')
        description: The exact copy or message you want the user to review
        entity_id: Optional ID of the staged database entity (message_id, post_id, match_id)
        badge_label: Short badge label (e.g. 'Cold DM Review', 'Publish Gate')
        action_payload: Any extra dictionary parameters needed upon approval
    """
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
