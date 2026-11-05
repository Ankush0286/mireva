from typing import Any
from uuid import UUID

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import (
    LeadStage,
    LeadTier,
    OutreachChannel,
    OutreachMessageStatus,
    PlatformType,
)
from app.common.exceptions import AppError
from app.modules.outreach.commands import (
    CreateLeadCommand,
    RecordMessageDeliveryCommand,
    RecordMessageFailureCommand,
    ReviewMessageCommand,
    StageMessageCommand,
)
from app.modules.outreach.exceptions import LeadAlreadyExistsError
from app.modules.outreach.service import OutreachService
from app.platforms.registry import PlatformRegistry


@marketing_agent.tool
def add_lead_to_crm(
    ctx: RunContext[AgentDeps],
    platform: str,
    handle: str,
    display_name: str | None = None,
    bio: str | None = None,
    follower_count: int | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Imports a discovered prospect or influencer lead into the social CRM.
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            cmd = CreateLeadCommand(
                platform=PlatformType(platform.lower()),
                handle=handle,
                display_name=display_name,
                bio=bio,
                follower_count=follower_count,
                tier=LeadTier.MICRO if (follower_count or 0) > 10000 else LeadTier.NANO,
                stage=LeadStage.DISCOVERED,
                tags=tags or [],
            )
            lead = service.create_lead(cmd)
            return {
                "id": str(lead.id),
                "handle": lead.handle,
                "platform": lead.platform.value,
                "stage": lead.stage.value,
            }
    except LeadAlreadyExistsError as exc:
        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            existing = service.get_lead_by_platform_and_handle(
                PlatformType(platform.lower()), handle
            )
            return {
                "error": str(exc),
                "id": str(existing.id) if existing else None,
                "handle": existing.handle if existing else handle,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
def list_crm_leads(
    ctx: RunContext[AgentDeps],
    platform: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Lists existing leads in the social CRM so you can find their lead_id before staging DMs.
    """
    with ctx.deps.db_session_scope() as db:
        service = OutreachService(db)
        p_enum = PlatformType(platform.lower()) if platform else None
        leads = service.list_leads(platform=p_enum, limit=limit)
        return [
            {
                "id": str(lead.id),
                "handle": lead.handle,
                "platform": lead.platform.value,
                "display_name": lead.display_name,
                "stage": lead.stage.value,
                "tier": lead.tier.value,
            }
            for lead in leads
        ]


@marketing_agent.tool
def stage_cold_outreach_dm(
    ctx: RunContext[AgentDeps],
    lead_id: str,
    account_id: str,
    message_content: str,
) -> dict[str, Any]:
    """
    Stages a personalized cold DM behind a human review gate.
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            cmd = StageMessageCommand(
                lead_id=UUID(lead_id),
                account_id=UUID(account_id),
                content=message_content,
                channel=OutreachChannel.DM,
            )
            msg = service.stage_message(cmd)
            return {
                "id": str(msg.id),
                "lead_id": str(msg.lead_id),
                "status": msg.status.value,
                "content_preview": msg.content[:80],
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
def review_staged_dm(
    ctx: RunContext[AgentDeps],
    message_id: str,
    approve: bool,
    edited_content: str | None = None,
) -> dict[str, Any]:
    """
    Human-in-the-loop review tool to approve or reject a staged cold DM.
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            cmd = ReviewMessageCommand(
                message_id=UUID(message_id),
                status=OutreachMessageStatus.APPROVED if approve else OutreachMessageStatus.REJECTED,
                edited_content=edited_content,
            )
            reviewed = service.review_message(cmd)
            return {
                "id": str(reviewed.id),
                "status": reviewed.status.value,
                "content": reviewed.content,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def dispatch_dm_now(
    ctx: RunContext[AgentDeps],
    message_id: str,
) -> dict[str, Any]:
    """
    Immediately dispatches a staged or approved cold DM to the recipient on Instagram or Twitter
    using the platform browser adapter and recorded send_dm recipe.
    Use this when the user explicitly asks to 'send a DM now'.
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            msg = service.get_message_by_id_or_raise(UUID(message_id))
            if msg.status == OutreachMessageStatus.STAGED:
                msg = service.review_message(
                    ReviewMessageCommand(
                        message_id=msg.id,
                        status=OutreachMessageStatus.APPROVED,
                    )
                )
            account = msg.account
            lead_handle = msg.lead.handle
            content_to_send = msg.content

        adapter = PlatformRegistry.get_adapter(account)
        try:
            thread_id = await adapter.send_dm(
                recipient_handle=lead_handle,
                message_text=content_to_send,
            )
        finally:
            await adapter.close()

        with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            delivered = service.record_delivery(
                RecordMessageDeliveryCommand(
                    message_id=UUID(message_id),
                    platform_message_id=thread_id,
                )
            )
            return {
                "id": str(delivered.id),
                "status": delivered.status.value,
                "recipient": lead_handle,
                "platform_thread_id": thread_id,
            }
    except Exception as exc:
        try:
            with ctx.deps.db_session_scope() as db:
                service = OutreachService(db)
                service.record_failure(
                    RecordMessageFailureCommand(
                        message_id=UUID(message_id),
                        error_message=str(exc),
                    )
                )
        except Exception:
            pass
        return {"error": f"Failed to dispatch DM: {exc}"}
