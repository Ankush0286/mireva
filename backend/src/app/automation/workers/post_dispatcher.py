import logging
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation.throttler import account_throttler
from app.common.enums import ActivitySeverity, ActivityType, CampaignStatus, PostStatus
from app.db.session import async_session_factory
from app.modules.accounts.service import AccountService
from app.modules.campaigns.commands import (
    RecordPostDeliveryCommand,
    RecordPostFailureCommand,
)
from app.modules.campaigns.models import Campaign, ScheduledPost
from app.modules.campaigns.service import CampaignService
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService
from app.platforms.registry import PlatformRegistry

logger = logging.getLogger(__name__)


async def _claim_post_for_publishing(
    db: AsyncSession, post_id: UUID, post: ScheduledPost | None = None
) -> bool:
    """
    Atomic claim guard: Transitions post to PUBLISHING only if it is still SCHEDULED
    and its parent Campaign remains eligible (not PAUSED, ARCHIVED, or COMPLETED).
    """
    eligible_campaign_subquery = (
        select(Campaign.id)
        .where(
            Campaign.id == ScheduledPost.campaign_id,
            Campaign.status.notin_(
                [
                    CampaignStatus.PAUSED,
                    CampaignStatus.ARCHIVED,
                    CampaignStatus.COMPLETED,
                ]
            ),
        )
        .scalar_subquery()
    )

    stmt = (
        update(ScheduledPost)
        .where(
            ScheduledPost.id == post_id,
            ScheduledPost.status == PostStatus.SCHEDULED,
            ScheduledPost.campaign_id == eligible_campaign_subquery,
        )
        .values(status=PostStatus.PUBLISHING)
        .execution_options(synchronize_session=False)
    )
    result = await db.execute(stmt)
    await db.commit()
    claimed = getattr(result, "rowcount", 0) > 0
    if claimed and post is not None:
        post.status = PostStatus.PUBLISHING
    return claimed


async def _dispatch_single_post(
    db: AsyncSession,
    post: ScheduledPost,
    campaign_service: CampaignService,
    account_service: AccountService,
    history_service: HistoryService,
) -> bool:
    account = post.account
    post_id = post.id
    account_id = account.id

    # Quota, Cooldown & Campaign Safety Guards
    if post.campaign and post.campaign.status in (
        CampaignStatus.PAUSED,
        CampaignStatus.ARCHIVED,
        CampaignStatus.COMPLETED,
    ):
        logger.warning(
            "Campaign '%s' is %s. Skipping post %s.",
            post.campaign.name,
            post.campaign.status.value,
            post_id,
        )
        return False

    if not account.can_post_today():
        reason = (
            "Account is paused (is_active=False)"
            if not account.is_active
            else f"Account status is '{account.status.value}'"
            if account.status.value != "active"
            else f"Account in cooldown until {account.cooldown_until}"
            if account.is_in_cooldown()
            else f"Daily post limit reached ({account.daily_posts_sent}/{account.daily_post_limit})"
        )
        logger.warning(
            "Account @%s cannot post: %s. Skipping post %s.", account.handle, reason, post_id
        )
        post.last_error_message = reason
        await db.commit()
        return False

    # 2. Anti-Ban Throttling Slot Check
    acquired = await account_throttler.wait_and_acquire(account_id, max_wait_seconds=5.0)
    if not acquired:
        logger.info(
            "Account @%s throttled for anti-ban pacing. Deferring post %s.", account.handle, post_id
        )
        return False

    # 3. Atomically Claim the Post (Prevents duplicate posts across concurrent workers)
    claimed = await _claim_post_for_publishing(db, post_id, post=post)
    if not claimed:
        logger.debug(
            "Post %s was already claimed or cancelled by another worker. Skipping.", post_id
        )
        return False

    # Read necessary properties into memory before launching browser
    content = post.content
    media_paths = list(post.media_urls) if post.media_urls else None
    account_platform = account.platform.value
    account_handle = account.handle

    # 4. Execute Platform Adapter
    try:
        adapter = PlatformRegistry.get_adapter(account)
        logger.info(
            "Dispatching post %s via %s adapter for @%s...",
            post_id,
            account_platform,
            account_handle,
        )

        try:
            result = await adapter.publish_post(
                content=content,
                media_paths=media_paths,
            )
        finally:
            await adapter.close()

        # 5. Record Delivery & Increment Quota in DB
        await campaign_service.record_delivery(
            RecordPostDeliveryCommand(
                post_id=post_id,
                platform_post_id=result.platform_post_id,
                platform_post_url=result.platform_post_url,
            )
        )
        await account_service.record_post_activity(account_id)

        await history_service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.POST_PUBLISHED,
                severity=ActivitySeverity.SUCCESS,
                title=f"Post published on {account_platform}",
                description=f"Successfully posted to @{account_handle}.",
                entity_type="post",
                entity_id=post_id,
                actor="post_dispatcher",
            )
        )
        logger.info("✅ Post %s published successfully (ID: %s)", post_id, result.platform_post_id)
        return True

    except Exception as exc:
        logger.error(
            "Failed to publish post %s for @%s: %s", post_id, account_handle, exc, exc_info=True
        )
        # Rollback any pending transaction state to keep session clean
        await db.rollback()
        await campaign_service.record_failure(
            RecordPostFailureCommand(
                post_id=post_id,
                error_message=str(exc),
            )
        )
        await history_service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.POST_FAILED,
                severity=ActivitySeverity.ERROR,
                title=f"Post delivery failed on {account_platform}",
                description=str(exc),
                entity_type="post",
                entity_id=post_id,
                actor="post_dispatcher",
            )
        )
        return False


async def run_post_dispatcher(db: AsyncSession | None = None) -> int:
    owns_session = db is None
    session = db if db is not None else async_session_factory()
    dispatched_count = 0

    try:
        campaign_service = CampaignService(session)
        account_service = AccountService(session)
        history_service = HistoryService(session)

        due_posts = await campaign_service.get_due_posts(limit=10)
        if not due_posts:
            return 0

        logger.info("PostDispatcher: Found %d due posts ready for delivery.", len(due_posts))

        post_ids = [p.id for p in due_posts]

        for post_id in post_ids:
            try:
                post = await campaign_service.get_post_by_id(post_id)
                if not post or post.status != PostStatus.SCHEDULED:
                    continue

                success = await _dispatch_single_post(
                    db=session,
                    post=post,
                    campaign_service=campaign_service,
                    account_service=account_service,
                    history_service=history_service,
                )
                if success:
                    dispatched_count += 1
            except Exception as iter_exc:
                logger.error("Error processing post %s: %s", post_id, iter_exc, exc_info=True)
                await session.rollback()

        return dispatched_count

    finally:
        if owns_session:
            await session.close()
