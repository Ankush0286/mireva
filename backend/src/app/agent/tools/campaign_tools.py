from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import ActivityType, CampaignStatus, PostContentType, PostStatus
from app.common.exceptions import AppError
from app.modules.accounts.service import AccountService
from app.modules.campaigns.commands import (
    CreateCampaignCommand,
    QueuePostCommand,
    RecordPostDeliveryCommand,
    RecordPostFailureCommand,
    UpdatePostCommand,
)
from app.modules.campaigns.service import CampaignService
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService
from app.platforms.registry import PlatformRegistry


@marketing_agent.tool
async def draft_campaign(
    ctx: RunContext[AgentDeps],
    name: str,
    description: str | None = None,
    target_audience: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            cmd = CreateCampaignCommand(
                name=name,
                description=description,
                target_audience=target_audience,
                status=CampaignStatus.ACTIVE,
                tags=tags or [],
            )
            campaign = await service.create_campaign(cmd)
            return {
                "id": str(campaign.id),
                "name": campaign.name,
                "status": campaign.status.value,
                "tags": campaign.tags,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def queue_social_post(
    ctx: RunContext[AgentDeps],
    campaign_id: str,
    account_id: str,
    content: str,
    scheduled_at_iso: str | None = None,
    media_urls: list[str] | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            account_service = AccountService(db)

            await account_service.get_by_id_or_raise(UUID(account_id))
            scheduled_dt: datetime | None = None
            post_status = PostStatus.DRAFT

            if scheduled_at_iso:
                scheduled_dt = datetime.fromisoformat(scheduled_at_iso.replace("Z", "+00:00"))
                post_status = PostStatus.SCHEDULED

            cmd = QueuePostCommand(
                campaign_id=UUID(campaign_id),
                account_id=UUID(account_id),
                content=content,
                content_type=PostContentType.IMAGE if media_urls else PostContentType.TEXT,
                media_urls=media_urls or [],
                scheduled_at=scheduled_dt,
                status=post_status,
            )
            post = await service.queue_post(cmd)

            return {
                "id": str(post.id),
                "campaign_id": str(post.campaign_id),
                "account_id": str(post.account_id),
                "content_preview": post.content[:80],
                "status": post.status.value,
                "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def schedule_existing_post(
    ctx: RunContext[AgentDeps],
    post_id: str,
    scheduled_at_iso: str | None = None,
    media_urls: list[str] | None = None,
) -> dict[str, Any]:
    try:
        async with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            post_uuid = UUID(post_id)

            scheduled_dt: datetime | None = None
            if scheduled_at_iso:
                scheduled_dt = datetime.fromisoformat(scheduled_at_iso.replace("Z", "+00:00"))
            else:
                scheduled_dt = datetime.now(UTC) + timedelta(minutes=5)

            updated = await service.update_post(
                UpdatePostCommand(
                    post_id=post_uuid,
                    scheduled_at=scheduled_dt,
                    status=PostStatus.SCHEDULED,
                    media_urls=media_urls if media_urls is not None else None,
                )
            )
            return {
                "id": str(updated.id),
                "status": updated.status.value,
                "scheduled_at": updated.scheduled_at.isoformat() if updated.scheduled_at else None,
                "content_preview": updated.content[:80],
                "media_urls": updated.media_urls,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
async def publish_post_now(
    ctx: RunContext[AgentDeps],
    post_id: str,
) -> dict[str, Any]:
    """
    Hardened publishing: Checks quotas and marks publishing in quick transaction,
    executes browser adapter outside the DB lock, and saves results in fresh scope.
    """
    try:
        post_uuid = UUID(post_id)

        # 1. Quick check & mark as publishing
        async with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            post = await service.get_post_by_id_or_raise(post_uuid)
            account = post.account

            if not account.can_post_today():
                return {
                    "id": str(post.id),
                    "status": "failed",
                    "error": f"Account @{account.handle} cannot post today (quota or cooldown)",
                }

            post.mark_as_publishing()
            await db.commit()

            # Read strings into memory before leaving session
            content = post.content
            media_paths = list(post.media_urls) if post.media_urls else None
            account_handle = account.handle
            account_id = account.id

        # 2. Browser dispatch executed outside the database lock
        adapter = PlatformRegistry.get_adapter(account)
        try:
            result = await adapter.publish_post(content=content, media_paths=media_paths)
        finally:
            await adapter.close()

        # 3. Finalize in database
        async with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            acc_service = AccountService(db)
            hist_service = HistoryService(db)

            published = await service.record_delivery(
                RecordPostDeliveryCommand(
                    post_id=post_uuid,
                    platform_post_id=result.platform_post_id,
                    platform_post_url=result.platform_post_url,
                )
            )
            await acc_service.record_post_activity(account_id)

            await hist_service.log_activity(
                LogActivityCommand(
                    activity_type=ActivityType.POST_PUBLISHED,
                    title="Post published by Copilot",
                    description=f"Dispatched to @{account_handle}",
                    entity_type="post",
                    entity_id=post_uuid,
                    actor="agent_copilot",
                )
            )

            return {
                "id": str(published.id),
                "status": "published",
                "platform_post_id": published.platform_post_id,
                "platform_post_url": published.platform_post_url,
            }

    except Exception as exc:
        try:
            async with ctx.deps.db_session_scope() as db:
                service = CampaignService(db)
                await service.record_failure(
                    RecordPostFailureCommand(post_id=post_uuid, error_message=str(exc))
                )
        except Exception:
            pass
        return {"error": f"Failed to publish post: {exc}"}


@marketing_agent.tool
async def list_pending_posts(
    ctx: RunContext[AgentDeps],
    status: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    async with ctx.deps.db_session_scope() as db:
        service = CampaignService(db)
        target_status: PostStatus | None = None
        statuses: list[PostStatus] | None = None

        if status:
            clean_status = status.strip().lower()
            try:
                target_status = PostStatus(clean_status)
            except ValueError:
                statuses = [PostStatus.DRAFT, PostStatus.SCHEDULED]
        else:
            statuses = [PostStatus.DRAFT, PostStatus.SCHEDULED]

        posts = await service.list_posts(
            status=target_status,
            statuses=statuses,
            limit=limit,
        )

        return [
            {
                "id": str(post.id),
                "campaign_id": str(post.campaign_id),
                "account_handle": post.account.handle,
                "platform": post.account.platform.value,
                "content": post.content,
                "status": post.status.value,
                "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
                "media_urls": post.media_urls,
                "retry_count": post.retry_count,
                "created_at": post.created_at.isoformat() if post.created_at else None,
            }
            for post in posts
        ]
