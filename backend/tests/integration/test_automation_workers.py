import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic_ai.models.test import TestModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import marketing_agent
from app.automation.scheduler import (
    get_scheduler,
    start_scheduler,
    stop_scheduler,
)
from app.automation.throttler import account_throttler
from app.automation.workers.dm_dispatcher import run_dm_dispatcher
from app.automation.workers.post_dispatcher import run_post_dispatcher
from app.automation.workers.quota_reset_worker import run_quota_reset_worker
from app.automation.workers.strategist_worker import (
    _build_review_digest,
    run_strategist_heartbeat,
)
from app.automation.workers.watcher_worker import run_watcher_worker
from app.common.enums import (
    CampaignStatus,
    LeadStage,
    OutreachChannel,
    OutreachMessageStatus,
    PlatformType,
    PostStatus,
    StrategistStatus,
    TriggerActionType,
    TriggerMatchStatus,
)
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.service import AccountService
from app.modules.campaigns.commands import (
    CreateCampaignCommand,
    QueuePostCommand,
)
from app.modules.campaigns.service import CampaignService
from app.modules.history.service import HistoryService
from app.modules.outreach.commands import (
    CreateLeadCommand,
    ReviewMessageCommand,
    StageMessageCommand,
)
from app.modules.outreach.service import OutreachService
from app.modules.strategist.service import StrategistService
from app.modules.triggers.commands import (
    AddWatchedHandleCommand,
    CreateTriggerRuleCommand,
)
from app.modules.triggers.service import TriggerService
from app.platforms.base import BasePlatformAdapter, PublishResult, ScrapedPost
from app.platforms.registry import PlatformRegistry
from app.platforms.twitter.adapter import TwitterAdapter


class MockAutomationAdapter(BasePlatformAdapter):
    """Mock platform adapter verifying worker interactions without network requests."""

    async def authenticate(self) -> bool:
        return True

    async def publish_post(
        self, content: str, media_paths: list[str] | None = None
    ) -> PublishResult:
        return PublishResult(
            platform_post_id="mock_post_123",
            platform_post_url="https://mock.platform/post/123",
        )

    async def send_dm(self, recipient_handle: str, message_text: str) -> str:
        return "mock_dm_thread_123"

    async def scrape_feed(self, target_handle: str, limit: int = 15) -> list[ScrapedPost]:
        return [
            ScrapedPost(
                platform_post_id="tweet_scraped_999",
                author_handle=target_handle,
                content="Looking for a solid alternative to expensive legacy tools.",
                platform_post_url=f"https://mock.platform/{target_handle}/status/999",
            )
        ]

    async def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def register_mock_adapter():
    """
    Temporarily registers MockAutomationAdapter for TWITTER and safely restores
    TwitterAdapter upon test teardown to prevent test isolation pollution.
    """
    original_adapter = PlatformRegistry._registry.get(PlatformType.TWITTER, TwitterAdapter)
    PlatformRegistry.register(PlatformType.TWITTER, MockAutomationAdapter)
    try:
        yield
    finally:
        if original_adapter:
            PlatformRegistry.register(PlatformType.TWITTER, original_adapter)


# =============================================================================
# Post Dispatcher Worker Tests
# =============================================================================


@pytest.mark.anyio
async def test_post_dispatcher_success_flow(db_session: AsyncSession):
    account_service = AccountService(db_session)
    campaign_service = CampaignService(db_session)
    history_service = HistoryService(db_session)

    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="dispatcher_bot",
            daily_post_limit=10,
        )
    )
    await account_throttler.reset(account.id)

    campaign = await campaign_service.create_campaign(
        CreateCampaignCommand(name="Auto Campaign", status=CampaignStatus.ACTIVE)
    )
    post = await campaign_service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Automated background post content",
            scheduled_at=datetime.now(UTC) - timedelta(minutes=5),
            status=PostStatus.SCHEDULED,
        )
    )

    dispatched = await run_post_dispatcher(db=db_session)
    assert dispatched == 1

    refreshed_post = await campaign_service.get_post_by_id_or_raise(post.id)
    assert refreshed_post.status == PostStatus.PUBLISHED
    assert refreshed_post.platform_post_id == "mock_post_123"

    await db_session.refresh(account)
    assert account.daily_posts_sent == 1

    logs = await history_service.list_activities(entity_id=post.id)
    assert len(logs) == 1
    assert logs[0].activity_type.value == "post_published"


@pytest.mark.anyio
async def test_post_dispatcher_skips_when_quota_exhausted(db_session: AsyncSession):
    account_service = AccountService(db_session)
    campaign_service = CampaignService(db_session)

    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="exhausted_bot",
            daily_post_limit=1,
        )
    )
    account.daily_posts_sent = 1
    await db_session.commit()

    campaign = await campaign_service.create_campaign(
        CreateCampaignCommand(name="Camp", status=CampaignStatus.ACTIVE)
    )
    post = await campaign_service.queue_post(
        QueuePostCommand(
            campaign_id=campaign.id,
            account_id=account.id,
            content="Cannot be posted",
            scheduled_at=datetime.now(UTC) - timedelta(minutes=1),
            status=PostStatus.SCHEDULED,
        )
    )

    dispatched = await run_post_dispatcher(db=db_session)
    assert dispatched == 0

    refreshed = await campaign_service.get_post_by_id_or_raise(post.id)
    assert refreshed.status == PostStatus.SCHEDULED


# =============================================================================
# Cold DM Dispatcher Worker Tests
# =============================================================================


@pytest.mark.anyio
async def test_dm_dispatcher_success_flow(db_session: AsyncSession):
    account_service = AccountService(db_session)
    outreach_service = OutreachService(db_session)
    history_service = HistoryService(db_session)

    # 1. Seed account & reset throttle
    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="sender_bot",
            daily_dm_limit=15,
        )
    )
    await account_throttler.reset(account.id)

    # 2. Seed lead in DISCOVERED stage
    lead = await outreach_service.create_lead(
        CreateLeadCommand(
            platform=PlatformType.TWITTER,
            handle="prospect_user",
            display_name="Prospect User",
            stage=LeadStage.DISCOVERED,
        )
    )

    # 3. Stage and approve cold DM
    staged = await outreach_service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Hey Prospect, loved your latest post!",
            channel=OutreachChannel.DM,
        )
    )
    await outreach_service.review_message(
        ReviewMessageCommand(
            message_id=staged.id,
            status=OutreachMessageStatus.APPROVED,
        )
    )

    # 4. Run Cold DM Dispatcher Worker
    dispatched = await run_dm_dispatcher(db=db_session)
    assert dispatched == 1

    # 5. Verify message dispatched and thread ID recorded
    refreshed_msg = await outreach_service.get_message_by_id_or_raise(staged.id)
    assert refreshed_msg.status == OutreachMessageStatus.DISPATCHED
    assert refreshed_msg.platform_message_id == "mock_dm_thread_123"

    # 6. Verify lead advanced from DISCOVERED -> CONTACTED
    refreshed_lead = await outreach_service.get_lead_by_id_or_raise(lead.id)
    assert refreshed_lead.stage == LeadStage.CONTACTED

    # 7. Verify daily DM count incremented
    await db_session.refresh(account)
    assert account.daily_dms_sent == 1

    # 8. Verify audit log entry created
    logs = await history_service.list_activities(entity_id=staged.id)
    assert len(logs) == 1
    assert logs[0].activity_type.value == "message_dispatched"


@pytest.mark.anyio
async def test_dm_dispatcher_skips_when_quota_exhausted(db_session: AsyncSession):
    account_service = AccountService(db_session)
    outreach_service = OutreachService(db_session)

    # Account with daily limit reached
    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="dm_exhausted_bot",
            daily_dm_limit=1,
        )
    )
    account.daily_dms_sent = 1
    await db_session.commit()

    lead = await outreach_service.create_lead(
        CreateLeadCommand(platform=PlatformType.TWITTER, handle="prospect_two")
    )
    staged = await outreach_service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Will not send",
        )
    )
    staged.status = OutreachMessageStatus.APPROVED
    await db_session.commit()

    dispatched = await run_dm_dispatcher(db=db_session)
    assert dispatched == 0

    refreshed = await outreach_service.get_message_by_id_or_raise(staged.id)
    assert refreshed.status == OutreachMessageStatus.APPROVED


@pytest.mark.anyio
async def test_dm_dispatcher_failure_flow(db_session: AsyncSession):
    account_service = AccountService(db_session)
    outreach_service = OutreachService(db_session)

    account = await account_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="fail_sender")
    )
    await account_throttler.reset(account.id)

    lead = await outreach_service.create_lead(
        CreateLeadCommand(platform=PlatformType.TWITTER, handle="fail_lead")
    )
    staged = await outreach_service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Testing failure",
        )
    )
    await outreach_service.review_message(
        ReviewMessageCommand(message_id=staged.id, status=OutreachMessageStatus.APPROVED)
    )

    # Force adapter to fail
    mock_adapter = MagicMock()
    mock_adapter.send_dm = AsyncMock(side_effect=RuntimeError("Twitter 429 Rate Limit"))
    mock_adapter.close = AsyncMock()

    with patch(
        "app.automation.workers.dm_dispatcher.PlatformRegistry.get_adapter",
        return_value=mock_adapter,
    ):
        dispatched = await run_dm_dispatcher(db=db_session)
        assert dispatched == 0

    refreshed = await outreach_service.get_message_by_id_or_raise(staged.id)
    assert refreshed.status == OutreachMessageStatus.FAILED
    assert "Twitter 429 Rate Limit" in (refreshed.last_error_message or "")


# =============================================================================
# Competitor Feed Watcher Worker Tests
# =============================================================================


@pytest.mark.anyio
async def test_watcher_worker_scrapes_and_generates_matches(db_session: AsyncSession):
    account_service = AccountService(db_session)
    trigger_service = TriggerService(db_session)

    scraper = await account_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="scraper_account")
    )

    handle = await trigger_service.add_watched_handle(
        AddWatchedHandleCommand(
            platform=PlatformType.TWITTER,
            handle="@competitor_brand",
            scrape_frequency_minutes=5,
        )
    )

    await trigger_service.create_rule(
        CreateTriggerRuleCommand(
            name="Alternative Keyword Rule",
            platform=PlatformType.TWITTER,
            account_id=scraper.id,
            watched_handle_id=handle.id,
            action_type=TriggerActionType.STAGE_DRAFT,
            keywords_any=["alternative"],
            response_template="Hey @{author}, check our open-source solution!",
        )
    )

    matches_created = await run_watcher_worker(db=db_session)
    assert matches_created == 1

    matches = await trigger_service.list_matches()
    assert len(matches) == 1
    assert matches[0].platform_post_id == "tweet_scraped_999"
    assert matches[0].status == TriggerMatchStatus.PENDING_REVIEW

    await db_session.refresh(handle)
    assert handle.last_scraped_at is not None


# =============================================================================
# Quota Reset & Cloud Sync Worker Tests
# =============================================================================


@pytest.mark.anyio
async def test_quota_reset_worker(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    account_service = AccountService(db_session)
    mock_sync = AsyncMock()
    monkeypatch.setattr("app.automation.workers.quota_reset_worker.sync_replica", mock_sync)

    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="stale_counter_bot",
            daily_post_limit=10,
        )
    )
    account.daily_posts_sent = 5
    account.daily_dms_sent = 8
    account.daily_counters_reset_at = datetime.now(UTC) - timedelta(hours=25)
    await db_session.commit()

    reset_count = await run_quota_reset_worker(db=db_session)
    assert reset_count == 1

    await db_session.refresh(account)
    assert account.daily_posts_sent == 0
    assert account.daily_dms_sent == 0
    mock_sync.assert_called_once()


# =============================================================================
# APScheduler Lifecycle Tests
# =============================================================================


@pytest.mark.anyio
async def test_scheduler_lifecycle():
    start_scheduler()
    sched = get_scheduler()
    assert sched.running is True

    # Verify all 4 background automation worker jobs are scheduled
    job_ids = [job.id for job in sched.get_jobs()]
    assert "post_dispatcher_job" in job_ids
    assert "dm_dispatcher_job" in job_ids
    assert "watcher_worker_job" in job_ids
    assert "quota_reset_job" in job_ids

    stop_scheduler()
    await asyncio.sleep(0.01)
    assert sched.running is False


@pytest.mark.anyio
async def test_strategist_heartbeat_worker_and_review_digest(
    db_session: AsyncSession,
) -> None:
    service = StrategistService(db_session)
    state = await service.record_sleep(duration_minutes=60, rationale="Future wake")

    # 1. Not due yet -> worker skips (returns 0)
    assert await run_strategist_heartbeat(db=db_session) == 0

    # 2. Age next_cycle_at into the past -> worker wakes up and executes cycle!
    state.next_cycle_at = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.commit()

    digest = await _build_review_digest(db_session)
    assert "=== HUMAN REVIEW QUEUE OUTCOMES ===" in digest

    mock_model = TestModel(
        call_tools=["sleep"],
        custom_output_text="Heartbeat cycle completed.",
    )
    with marketing_agent.override(model=mock_model):
        ran_due = await run_strategist_heartbeat(db=db_session)
        assert ran_due == 1

    await db_session.refresh(state)
    assert state.cycle_count == 1
    assert state.status == StrategistStatus.SLEEPING


@pytest.mark.anyio
async def test_quota_reset_worker_skips_recent_dm_counters(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    account_service = AccountService(db_session)
    mock_sync = AsyncMock()
    monkeypatch.setattr("app.automation.workers.quota_reset_worker.sync_replica", mock_sync)

    account = await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="recent_dm_bot",
            daily_post_limit=10,
            daily_dm_limit=15,
        )
    )
    account.daily_posts_sent = 0
    account.daily_dms_sent = 4
    account.daily_counters_reset_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.commit()

    reset_count = await run_quota_reset_worker(db=db_session)
    assert reset_count == 0

    await db_session.refresh(account)
    assert account.daily_dms_sent == 4
