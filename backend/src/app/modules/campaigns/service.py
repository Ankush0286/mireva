from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.enums import CampaignStatus, PostStatus
from app.modules.accounts.exceptions import AccountNotFoundError
from app.modules.accounts.models import ConnectedAccount
from app.modules.campaigns.commands import (
    CreateCampaignCommand,
    QueuePostCommand,
    RecordPostDeliveryCommand,
    RecordPostFailureCommand,
    UpdateCampaignCommand,
    UpdatePostCommand,
)
from app.modules.campaigns.exceptions import (
    CampaignInactiveError,
    CampaignNotFoundError,
    InvalidPostScheduleError,
    PostAlreadyPublishedError,
    PostNotFoundError,
)
from app.modules.campaigns.models import Campaign, ScheduledPost


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class CampaignService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Campaign Queries & Mutations
    # =========================================================================

    async def get_campaign_by_id(self, campaign_id: UUID | str) -> Campaign | None:
        target_id = _ensure_uuid(campaign_id)
        stmt = (
            select(Campaign).options(selectinload(Campaign.posts)).where(Campaign.id == target_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_campaign_by_id_or_raise(self, campaign_id: UUID | str) -> Campaign:
        campaign = await self.get_campaign_by_id(campaign_id)
        if not campaign:
            raise CampaignNotFoundError(campaign_id)
        return campaign

    async def list_campaigns(self, status: CampaignStatus | None = None) -> list[Campaign]:
        stmt = select(Campaign).order_by(Campaign.created_at.desc())
        if status is not None:
            stmt = stmt.where(Campaign.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_campaign(self, cmd: CreateCampaignCommand) -> Campaign:
        campaign = Campaign(
            name=cmd.name,
            description=cmd.description,
            target_audience=cmd.target_audience,
            status=cmd.status,
            start_date=cmd.start_date,
            end_date=cmd.end_date,
            tags=cmd.tags,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def update_campaign(self, cmd: UpdateCampaignCommand) -> Campaign:
        campaign = await self.get_campaign_by_id_or_raise(cmd.campaign_id)

        if cmd.name is not None:
            campaign.name = cmd.name
        if cmd.description is not None:
            campaign.description = cmd.description
        if cmd.target_audience is not None:
            campaign.target_audience = cmd.target_audience
        if cmd.status is not None:
            campaign.status = cmd.status
        if cmd.start_date is not None:
            campaign.start_date = cmd.start_date
        if cmd.end_date is not None:
            campaign.end_date = cmd.end_date
        if cmd.tags is not None:
            campaign.tags = cmd.tags
        if cmd.extra_metadata is not None:
            campaign.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def delete_campaign(self, campaign_id: UUID | str) -> None:
        campaign = await self.get_campaign_by_id_or_raise(campaign_id)
        await self.db.delete(campaign)
        await self.db.commit()

    # =========================================================================
    # Scheduled Post Queries & Lifecycle Mutations
    # =========================================================================

    async def get_post_by_id(self, post_id: UUID | str) -> ScheduledPost | None:
        target_id = _ensure_uuid(post_id)
        stmt = (
            select(ScheduledPost)
            .options(
                selectinload(ScheduledPost.campaign),
                selectinload(ScheduledPost.account),
            )
            .where(ScheduledPost.id == target_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_post_by_id_or_raise(self, post_id: UUID | str) -> ScheduledPost:
        post = await self.get_post_by_id(post_id)
        if not post:
            raise PostNotFoundError(post_id)
        return post

    async def list_posts_by_campaign(
        self, campaign_id: UUID | str, status: PostStatus | None = None
    ) -> list[ScheduledPost]:
        target_id = _ensure_uuid(campaign_id)
        await self.get_campaign_by_id_or_raise(target_id)

        stmt = (
            select(ScheduledPost)
            .options(selectinload(ScheduledPost.account))
            .where(ScheduledPost.campaign_id == target_id)
            .order_by(ScheduledPost.scheduled_at.asc(), ScheduledPost.created_at.asc())
        )
        if status is not None:
            stmt = stmt.where(ScheduledPost.status == status)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_due_posts(self, limit: int = 50) -> list[ScheduledPost]:
        now = datetime.now(UTC)
        stmt = (
            select(ScheduledPost)
            .options(selectinload(ScheduledPost.account))
            .where(
                ScheduledPost.status == PostStatus.SCHEDULED,
                ScheduledPost.scheduled_at <= now,
            )
            .order_by(ScheduledPost.scheduled_at.asc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def queue_post(self, cmd: QueuePostCommand) -> ScheduledPost:
        campaign = await self.get_campaign_by_id_or_raise(cmd.campaign_id)

        if campaign.status in (CampaignStatus.ARCHIVED, CampaignStatus.COMPLETED):
            raise CampaignInactiveError(campaign.id, campaign.status.value)

        acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
        acc_result = await self.db.execute(acc_stmt)
        account = acc_result.scalars().first()
        if not account:
            raise AccountNotFoundError(cmd.account_id)

        if cmd.scheduled_at:
            scheduled_utc = (
                cmd.scheduled_at.replace(tzinfo=UTC)
                if cmd.scheduled_at.tzinfo is None
                else cmd.scheduled_at
            )
            if campaign.end_date:
                end_utc = (
                    campaign.end_date.replace(tzinfo=UTC)
                    if campaign.end_date.tzinfo is None
                    else campaign.end_date
                )
                if scheduled_utc > end_utc:
                    raise InvalidPostScheduleError(
                        f"Post schedule time ({scheduled_utc.isoformat()}) exceeds "
                        f"campaign end date ({end_utc.isoformat()})."
                    )

        post = ScheduledPost(
            campaign_id=cmd.campaign_id,
            account_id=cmd.account_id,
            content=cmd.content,
            content_type=cmd.content_type,
            media_urls=cmd.media_urls,
            scheduled_at=cmd.scheduled_at,
            status=cmd.status,
            max_retries=cmd.max_retries,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(post)
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def update_post(self, cmd: UpdatePostCommand) -> ScheduledPost:
        post = await self.get_post_by_id_or_raise(cmd.post_id)

        if post.status == PostStatus.PUBLISHED:
            raise PostAlreadyPublishedError(post.id)

        if cmd.account_id is not None:
            acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
            acc_res = await self.db.execute(acc_stmt)
            account = acc_res.scalars().first()
            if not account:
                raise AccountNotFoundError(cmd.account_id)
            post.account_id = cmd.account_id

        if cmd.content is not None:
            post.content = cmd.content
        if cmd.content_type is not None:
            post.content_type = cmd.content_type
        if cmd.media_urls is not None:
            post.media_urls = cmd.media_urls
        if cmd.scheduled_at is not None:
            post.scheduled_at = cmd.scheduled_at
        if cmd.status is not None:
            post.status = cmd.status
        if cmd.extra_metadata is not None:
            post.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def cancel_post(self, post_id: UUID | str) -> ScheduledPost:
        post = await self.get_post_by_id_or_raise(post_id)
        if post.status == PostStatus.PUBLISHED:
            raise PostAlreadyPublishedError(post.id)

        post.status = PostStatus.CANCELLED
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def delete_post(self, post_id: UUID | str) -> None:
        post = await self.get_post_by_id_or_raise(post_id)
        if post.status == PostStatus.PUBLISHED:
            raise PostAlreadyPublishedError(post.id)

        await self.db.delete(post)
        await self.db.commit()

    async def record_delivery(self, cmd: RecordPostDeliveryCommand) -> ScheduledPost:
        post = await self.get_post_by_id_or_raise(cmd.post_id)
        post.mark_as_published(
            post_id=cmd.platform_post_id,
            post_url=cmd.platform_post_url,
        )
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def record_failure(self, cmd: RecordPostFailureCommand) -> ScheduledPost:
        post = await self.get_post_by_id_or_raise(cmd.post_id)
        post.mark_as_failed(error=cmd.error_message)
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def list_posts(
        self,
        status: PostStatus | None = None,
        statuses: list[PostStatus] | None = None,
        campaign_id: UUID | None = None,
        limit: int = 50,
    ) -> list[ScheduledPost]:
        stmt = (
            select(ScheduledPost)
            .options(selectinload(ScheduledPost.account))
            .order_by(ScheduledPost.created_at.desc())
        )

        if status is not None:
            stmt = stmt.where(ScheduledPost.status == status)
        elif statuses is not None:
            stmt = stmt.where(ScheduledPost.status.in_(statuses))

        if campaign_id is not None:
            stmt = stmt.where(ScheduledPost.campaign_id == campaign_id)

        result = await self.db.execute(stmt.limit(limit))
        return list(result.scalars().all())
