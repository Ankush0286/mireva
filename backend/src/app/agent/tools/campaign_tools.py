from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import CampaignStatus, PostContentType, PostStatus
from app.common.exceptions import AppError
from app.modules.accounts.service import AccountService
from app.modules.campaigns.commands import (
    CreateCampaignCommand,
    QueuePostCommand,
    UpdatePostCommand,
)
from app.modules.campaigns.service import CampaignService
from app.modules.history.service import HistoryService


@marketing_agent.tool
def draft_campaign(
    ctx: RunContext[AgentDeps],
    name: str,
    description: str | None = None,
    target_audience: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Creates a new marketing campaign to group and organize scheduled posts."""
    try:
        with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            cmd = CreateCampaignCommand(
                name=name,
                description=description,
                target_audience=target_audience,
                status=CampaignStatus.ACTIVE,
                tags=tags or [],
            )
            campaign = service.create_campaign(cmd)
            return {
                "id": str(campaign.id),
                "name": campaign.name,
                "status": campaign.status.value,
                "tags": campaign.tags,
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
def queue_social_post(
    ctx: RunContext[AgentDeps],
    campaign_id: str,
    account_id: str,
    content: str,
    scheduled_at_iso: str | None = None,
    media_urls: list[str] | None = None,
) -> dict[str, Any]:
    """
    Creates a new post. If scheduled_at_iso is omitted, saves as a draft.
    To schedule or publish an EXISTING post, use schedule_existing_post or publish_post_now.
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            account_service = AccountService(db)

            account_service.get_by_id_or_raise(UUID(account_id))
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
            post = service.queue_post(cmd)

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
def schedule_existing_post(
    ctx: RunContext[AgentDeps],
    post_id: str,
    scheduled_at_iso: str | None = None,
    media_urls: list[str] | None = None,
) -> dict[str, Any]:
    """
    Schedules an existing draft post by setting its publish time and status to 'scheduled'.
    Can also attach or update media_urls (image or video URLs).
    """
    try:
        with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            post_uuid = UUID(post_id)

            scheduled_dt: datetime | None = None
            if scheduled_at_iso:
                scheduled_dt = datetime.fromisoformat(scheduled_at_iso.replace("Z", "+00:00"))
            else:
                scheduled_dt = datetime.now(UTC) + timedelta(minutes=5)

            updated = service.update_post(
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
    Immediately dispatches and publishes a post to its platform (Instagram, Twitter, etc.).
    Use this when the user says 'post it now', 'publish now', or 'post to insta'.
    """
    try:
        from app.automation.workers.post_dispatcher import _dispatch_single_post

        with ctx.deps.db_session_scope() as db:
            service = CampaignService(db)
            account_service = AccountService(db)
            history_service = HistoryService(db)
            post = service.get_post_by_id_or_raise(UUID(post_id))

            success = await _dispatch_single_post(
                db=db,
                post=post,
                campaign_service=service,
                account_service=account_service,
                history_service=history_service,
            )

            if success:
                return {
                    "id": str(post.id),
                    "status": "published",
                    "platform_post_id": post.platform_post_id,
                    "platform_post_url": post.platform_post_url,
                }
            return {
                "id": str(post.id),
                "status": post.status.value,
                "error": post.last_error_message or "Failed to dispatch post",
            }
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}


@marketing_agent.tool
def list_pending_posts(
    ctx: RunContext[AgentDeps],
    status: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Lists posts in the workspace. Supports filtering by status:
    'draft', 'scheduled', 'published', or 'failed'.
    If status is omitted, returns pending posts (drafts & scheduled).
    """
    with ctx.deps.db_session_scope() as db:
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

        posts = service.list_posts(
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
