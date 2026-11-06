from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    CampaignStatus,
    PlatformType,
    PostContentType,
    PostStatus,
)
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.exceptions import AccountNotFoundError
from app.modules.accounts.models import ConnectedAccount
from app.modules.accounts.service import AccountService
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
from app.modules.campaigns.service import CampaignService


async def _create_sample_account(db: AsyncSession, handle: str = "growth_bot") -> ConnectedAccount:
    """Helper to register a connected account for post associations."""
    account_service = AccountService(db)
    return await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle=handle,
            display_name="Growth Bot",
        )
    )


# =============================================================================
# Campaign Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_create_and_get_campaign(db_session: AsyncSession):
    service = CampaignService(db_session)
    cmd = CreateCampaignCommand(
        name="Launch Campaign",
        description="Q4 Marketing Strategy",
        status=CampaignStatus.ACTIVE,
        tags=["ai", "launch"],
    )

    campaign = await service.create_campaign(cmd)

    assert campaign.id is not None
    assert campaign.name == "Launch Campaign"
    assert campaign.status == CampaignStatus.ACTIVE
    assert "launch" in campaign.tags

    queried = await service.get_campaign_by_id_or_raise(campaign.id)
    assert queried.id == campaign.id


@pytest.mark.anyio
async def test_get_campaign_not_found_raises(db_session: AsyncSession):
    service = CampaignService(db_session)
    with pytest.raises(CampaignNotFoundError):
        await service.get_campaign_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_list_campaigns_with_filter(db_session: AsyncSession):
    service = CampaignService(db_session)
    await service.create_campaign(CreateCampaignCommand(name="C1", status=CampaignStatus.ACTIVE))
    await service.create_campaign(CreateCampaignCommand(name="C2", status=CampaignStatus.DRAFT))

    active = await service.list_campaigns(status=CampaignStatus.ACTIVE)
    assert len(active) == 1
    assert active[0].name == "C1"

    all_campaigns = await service.list_campaigns()
    assert len(all_campaigns) == 2


@pytest.mark.anyio
async def test_update_campaign(db_session: AsyncSession):
    service = CampaignService(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Old Name"))

    updated = await service.update_campaign(
        UpdateCampaignCommand(
            campaign_id=campaign.id,
            name="New Name",
            status=CampaignStatus.PAUSED,
        )
    )

    assert updated.name == "New Name"
    assert updated.status == CampaignStatus.PAUSED


@pytest.mark.anyio
async def test_delete_campaign_cascades_posts(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)

    campaign = await service.create_campaign(CreateCampaignCommand(name="To Delete"))
    post = await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Post to be deleted",
            status=PostStatus.DRAFT,
        )
    )

    await service.delete_campaign(campaign.id)

    assert await service.get_campaign_by_id(campaign.id) is None
    assert await service.get_post_by_id(post.id) is None


@pytest.mark.anyio
async def test_campaign_is_active_helper():
    now = datetime.now(UTC)
    active_camp = CreateCampaignCommand(
        name="Active",
        status=CampaignStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=5),
    )
    from app.modules.campaigns.models import Campaign
    c = Campaign(
        name=active_camp.name,
        status=active_camp.status,
        start_date=active_camp.start_date,
        end_date=active_camp.end_date,
    )
    assert c.is_active() is True

    c.status = CampaignStatus.PAUSED
    assert c.is_active() is False

    c.status = CampaignStatus.ACTIVE
    c.start_date = now + timedelta(days=1)  # Future start date
    assert c.is_active() is False


# =============================================================================
# Scheduled Post Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_queue_post_success(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Active Camp"))

    scheduled_time = datetime.now(UTC) + timedelta(days=2)
    cmd = QueuePostCommand(
        campaign_id=campaign.id,
        account_id=account.id,
        content="Hello world! Check out our new AI tool.",
        content_type=PostContentType.TEXT,
        scheduled_at=scheduled_time,
    )

    post = await service.queue_post(cmd)

    assert post.id is not None
    assert post.content == cmd.content
    assert post.status == PostStatus.SCHEDULED
    assert post.account_id == account.id


@pytest.mark.anyio
async def test_queue_post_fails_on_inactive_campaign(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(
        CreateCampaignCommand(name="Archived Camp", status=CampaignStatus.ARCHIVED)
    )

    with pytest.raises(CampaignInactiveError):
        await service.queue_post(
            QueuePostCommand(
                campaign_id=campaign.id,
                account_id=account.id,
                content="This should fail",
            )
        )


@pytest.mark.anyio
async def test_queue_post_fails_on_nonexistent_account(db_session: AsyncSession):
    service = CampaignService(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Active Camp"))

    with pytest.raises(AccountNotFoundError):
        await service.queue_post(
            QueuePostCommand(
                campaign_id=campaign.id,
                account_id=uuid4(),
                content="No account",
            )
        )


@pytest.mark.anyio
async def test_queue_post_fails_when_schedule_exceeds_campaign_end_date(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)

    campaign_end = datetime.now(UTC) + timedelta(days=5)
    campaign = await service.create_campaign(
        CreateCampaignCommand(name="Time-bound", end_date=campaign_end)
    )

    with pytest.raises(InvalidPostScheduleError):
        await service.queue_post(
            QueuePostCommand(
                campaign_id=campaign.id,
                account_id=account.id,
                content="Too late",
                scheduled_at=campaign_end + timedelta(days=1),
            )
        )


@pytest.mark.anyio
async def test_update_and_cancel_post(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Camp"))

    post = await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Draft copy",
            status=PostStatus.DRAFT,
        )
    )

    updated = await service.update_post(
        UpdatePostCommand(
            post_id=post.id,
            content="Polished copy",
        )
    )
    assert updated.content == "Polished copy"

    cancelled = await service.cancel_post(post.id)
    assert cancelled.status == PostStatus.CANCELLED


@pytest.mark.anyio
async def test_published_post_cannot_be_modified_or_deleted(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Camp"))

    post = await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Already sent",
            status=PostStatus.DRAFT,
        )
    )

    # Deliver post
    await service.record_delivery(
        RecordPostDeliveryCommand(
            post_id=post.id,
            platform_post_id="tweet_123",
            platform_post_url="https://x.com/post/123",
        )
    )
    assert post.status == PostStatus.PUBLISHED
    assert post.platform_post_id == "tweet_123"

    # Modifying published post must raise
    with pytest.raises(PostAlreadyPublishedError):
        await service.update_post(UpdatePostCommand(post_id=post.id, content="Change"))

    # Deleting published post must raise
    with pytest.raises(PostAlreadyPublishedError):
        await service.delete_post(post.id)


@pytest.mark.anyio
async def test_get_due_posts_worker_query(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Camp"))

    now = datetime.now(UTC)

    # Due post (scheduled 10 minutes ago)
    await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Due now",
            scheduled_at=now - timedelta(minutes=10),
            status=PostStatus.SCHEDULED,
        )
    )

    # Future post (scheduled 1 hour from now)
    await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Future post",
            scheduled_at=now + timedelta(hours=1),
            status=PostStatus.SCHEDULED,
        )
    )

    due_posts = await service.get_due_posts(limit=10)
    assert len(due_posts) == 1
    assert due_posts[0].content == "Due now"


@pytest.mark.anyio
async def test_list_posts_by_campaign_with_filter(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Filter Camp"))

    await service.queue_post(
        QueuePostCommand(campaign_id=campaign.id, account_id=account.id, content="P1", status=PostStatus.DRAFT)
    )
    await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="P2",
            status=PostStatus.SCHEDULED,
            scheduled_at=datetime.now(UTC) + timedelta(hours=2),
        )
    )

    all_posts = await service.list_posts_by_campaign(campaign.id)
    draft_posts = await service.list_posts_by_campaign(campaign.id, status=PostStatus.DRAFT)

    assert len(all_posts) == 2
    assert len(draft_posts) == 1
    assert draft_posts[0].content == "P1"


@pytest.mark.anyio
async def test_list_posts_multiple_statuses_query(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Multi Camp"))

    await service.queue_post(
        QueuePostCommand(campaign_id=campaign.id, account_id=account.id, content="P1", status=PostStatus.DRAFT)
    )
    await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="P2",
            status=PostStatus.SCHEDULED,
            scheduled_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )

    posts = await service.list_posts(statuses=[PostStatus.DRAFT, PostStatus.SCHEDULED])
    assert len(posts) >= 2


@pytest.mark.anyio
async def test_record_failure_retry_mechanism(db_session: AsyncSession):
    service = CampaignService(db_session)
    account = await _create_sample_account(db_session)
    campaign = await service.create_campaign(CreateCampaignCommand(name="Camp"))

    post = await service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Retriable post",
            max_retries=2,
            status=PostStatus.SCHEDULED,
        )
    )

    # 1st failure -> stays SCHEDULED for retry
    await service.record_failure(RecordPostFailureCommand(post_id=post.id, error_message="Rate limit 429"))
    assert post.retry_count == 1
    assert post.status == PostStatus.SCHEDULED

    # 2nd failure -> reaches max_retries, transitions to FAILED
    await service.record_failure(RecordPostFailureCommand(post_id=post.id, error_message="Rate limit 429"))
    assert post.retry_count == 2
    assert post.status == PostStatus.FAILED
    assert post.last_error_message == "Rate limit 429"


@pytest.mark.anyio
async def test_get_post_by_id_or_raise_not_found(db_session: AsyncSession):
    service = CampaignService(db_session)
    with pytest.raises(PostNotFoundError):
        await service.get_post_by_id_or_raise(uuid4())
