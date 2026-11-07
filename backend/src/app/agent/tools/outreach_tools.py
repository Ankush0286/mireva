from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic_ai import RunContext
from sqlalchemy import select

from app.agent.browser_agent import (
    read_and_summarize_inbox,
    scout_influencer_leads,
)
from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import (
    AutonomyLevel,
    LeadStage,
    LeadTier,
    OutreachChannel,
    OutreachMessageStatus,
    PlatformType,
)
from app.common.exceptions import AppError
from app.modules.accounts.service import AccountService
from app.modules.outreach.commands import (
    CreateLeadCommand,
    RecordMessageDeliveryCommand,
    RecordMessageFailureCommand,
    ReviewMessageCommand,
    StageMessageCommand,
)
from app.modules.outreach.exceptions import LeadAlreadyExistsError
from app.modules.outreach.service import OutreachService
from app.modules.strategist.models import StrategistState
from app.platforms.registry import PlatformRegistry


@marketing_agent.tool
async def read_inbox_with_browser_agent(
    ctx: RunContext[AgentDeps],
    account_id: str,
    specific_user: str | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = AccountService(db)
            account = await service.get_by_id_or_raise(UUID(account_id))

        summary = await read_and_summarize_inbox(
            account=account,
            specific_user=specific_user,
            headless=True,
        )
        return {
            "account_handle": account.handle,
            "platform": account.platform.value,
            "inbox_summary": summary,
        }
    except Exception as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def scout_creators_with_browser_agent(
    ctx: RunContext[AgentDeps],
    account_id: str,
    niche_or_hashtag: str,
    max_leads: int = 5,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = AccountService(db)
            account = await service.get_by_id_or_raise(UUID(account_id))

        report = await scout_influencer_leads(
            account=account,
            niche_or_query=niche_or_hashtag,
            max_leads=max_leads,
            headless=True,
        )
        return {
            "niche": niche_or_hashtag,
            "scout_report": report,
        }
    except Exception as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def add_lead_to_crm(
    ctx: RunContext[AgentDeps],
    platform: str,
    handle: str,
    display_name: str | None = None,
    bio: str | None = None,
    follower_count: int | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
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
            lead = await service.create_lead(cmd)
            return {
                "id": str(lead.id),
                "handle": lead.handle,
                "platform": lead.platform.value,
                "stage": lead.stage.value,
            }
    except LeadAlreadyExistsError as exc:
        async with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            existing = await service.get_lead_by_platform_and_handle(
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
async def list_crm_leads(
    ctx: RunContext[AgentDeps],
    platform: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    async with ctx.deps.db_session_scope() as db:
        service = OutreachService(db)
        p_enum = PlatformType(platform.lower()) if platform else None
        leads = await service.list_leads(platform=p_enum, limit=limit)
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
async def stage_cold_outreach_dm(
    ctx: RunContext[AgentDeps],
    lead_id: str,
    account_id: str,
    message_content: str,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            acc_service = AccountService(db)
            account = await acc_service.get_by_id_or_raise(UUID(account_id))

            # Check if Full Auto policy is active
            res = await db.execute(select(StrategistState).order_by(StrategistState.created_at.desc()).limit(1))
            state = res.scalars().first()
            is_full_auto = state is not None and state.autonomy_level == AutonomyLevel.FULL_AUTO

            cmd = StageMessageCommand(
                lead_id=UUID(lead_id),
                account_id=UUID(account_id),
                content=message_content,
                channel=OutreachChannel.DM,
            )
            msg = await service.stage_message(cmd)

            # In Full Auto mode, auto-approve immediately if account quotas allow
            if is_full_auto and account.can_send_dm_today():
                msg.status = OutreachMessageStatus.APPROVED
                msg.reviewed_at = datetime.now(UTC)
                await db.commit()
                await db.refresh(msg)

            return {
                "id": str(msg.id),
                "lead_id": str(msg.lead_id),
                "status": msg.status.value,
                "content_preview": msg.content[:80],
                "auto_approved": is_full_auto,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}

@marketing_agent.tool
async def review_staged_dm(
    ctx: RunContext[AgentDeps],
    message_id: str,
    approve: bool,
    edited_content: str | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            cmd = ReviewMessageCommand(
                message_id=UUID(message_id),
                status=OutreachMessageStatus.APPROVED
                if approve
                else OutreachMessageStatus.REJECTED,
                edited_content=edited_content,
            )
            reviewed = await service.review_message(cmd)
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
    Hardened DM dispatch: Captures account and recipient handle BEFORE triggering
    state refreshes, preventing MissingGreenlet lazy-load crashes in async SQLAlchemy.
    """
    try:
        async with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            msg = await service.get_message_by_id_or_raise(UUID(message_id))

            # Read related entities into memory before any refresh
            account = msg.account
            lead_handle = msg.lead.handle
            content_to_send = msg.content

            if msg.status == OutreachMessageStatus.STAGED:
                await service.review_message(
                    ReviewMessageCommand(
                        message_id=msg.id,
                        status=OutreachMessageStatus.APPROVED,
                    )
                )

        # Execute browser adapter outside the database lock
        adapter = PlatformRegistry.get_adapter(account)
        try:
            thread_id = await adapter.send_dm(
                recipient_handle=lead_handle,
                message_text=content_to_send,
            )
        finally:
            await adapter.close()

        # Record outcome in a fresh database scope
        async with ctx.deps.db_session_scope() as db:
            service = OutreachService(db)
            delivered = await service.record_delivery(
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
            async with ctx.deps.db_session_scope() as db:
                service = OutreachService(db)
                await service.record_failure(
                    RecordMessageFailureCommand(
                        message_id=UUID(message_id),
                        error_message=str(exc),
                    )
                )
        except Exception:
            pass
        return {"error": f"Failed to dispatch DM: {exc}"}
