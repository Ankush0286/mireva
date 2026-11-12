from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ActivitySeverity, ActivityType
from app.modules.history.commands import LogActivityCommand
from app.modules.history.exceptions import ActivityLogNotFoundError
from app.modules.history.service import HistoryService


@pytest.mark.anyio
async def test_log_activity_and_get_by_id(db_session: AsyncSession):
    service = HistoryService(db_session)
    entity_uuid = uuid4()

    cmd = LogActivityCommand(
        activity_type=ActivityType.POST_PUBLISHED,
        severity=ActivitySeverity.SUCCESS,
        title="Twitter post published successfully",
        description="Tweet ID 123456789 dispatched via API.",
        entity_type="post",
        entity_id=entity_uuid,
        actor="post_dispatcher",
        extra_metadata={"platform": "twitter", "tweet_id": "123456789"},
    )

    log = await service.log_activity(cmd)

    assert log.id is not None
    assert log.activity_type == ActivityType.POST_PUBLISHED
    assert log.severity == ActivitySeverity.SUCCESS
    assert log.entity_type == "post"
    assert log.entity_id == entity_uuid
    assert log.actor == "post_dispatcher"
    assert log.extra_metadata["tweet_id"] == "123456789"

    # Query back by ID
    queried = await service.get_by_id_or_raise(log.id)
    assert queried.id == log.id
    assert queried.title == "Twitter post published successfully"


@pytest.mark.anyio
async def test_get_nonexistent_log_raises(db_session: AsyncSession):
    service = HistoryService(db_session)
    with pytest.raises(ActivityLogNotFoundError):
        await service.get_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_list_activities_with_filtering(db_session: AsyncSession):
    service = HistoryService(db_session)
    account_uuid = uuid4()

    # Create logs with different types and severities
    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.ACCOUNT_CONNECTED,
            severity=ActivitySeverity.SUCCESS,
            title="Account Connected",
            entity_type="account",
            entity_id=account_uuid,
        )
    )
    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.ACCOUNT_COOLDOWN_TRIGGERED,
            severity=ActivitySeverity.WARNING,
            title="Rate limit cooldown applied",
            entity_type="account",
            entity_id=account_uuid,
        )
    )
    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.LEAD_IMPORTED,
            severity=ActivitySeverity.INFO,
            title="Lead imported",
            entity_type="lead",
        )
    )

    # 1. Filter by severity
    warning_logs = await service.list_activities(severity=ActivitySeverity.WARNING)
    assert len(warning_logs) == 1
    assert warning_logs[0].activity_type == ActivityType.ACCOUNT_COOLDOWN_TRIGGERED

    # 2. Filter by entity type and ID
    account_logs = await service.list_activities(entity_type="account", entity_id=account_uuid)
    assert len(account_logs) == 2

    # 3. Filter by activity type
    lead_logs = await service.list_activities(activity_type=ActivityType.LEAD_IMPORTED)
    assert len(lead_logs) == 1
    assert lead_logs[0].title == "Lead imported"


@pytest.mark.anyio
async def test_list_activities_date_filtering_and_pagination(db_session: AsyncSession):
    service = HistoryService(db_session)

    for idx in range(5):
        await service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.TRIGGER_MATCHED,
                title=f"Matched tweet {idx}",
            )
        )

    # Pagination: limit 2, offset 0
    page1 = await service.list_activities(limit=2, offset=0)
    assert len(page1) == 2

    # Pagination: limit 2, offset 2
    page2 = await service.list_activities(limit=2, offset=2)
    assert len(page2) == 2
    assert page1[0].id != page2[0].id

    # Date filtering: since
    now = datetime.now(UTC)
    recent = await service.list_activities(since=now - timedelta(minutes=5))
    assert len(recent) == 5

    future = await service.list_activities(since=now + timedelta(hours=1))
    assert len(future) == 0

    # Date filtering: until
    past_cutoff = now - timedelta(hours=1)
    before_past = await service.list_activities(until=past_cutoff)
    assert len(before_past) == 0


@pytest.mark.anyio
async def test_count_activities(db_session: AsyncSession):
    service = HistoryService(db_session)

    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.POST_FAILED,
            severity=ActivitySeverity.ERROR,
            title="Post Delivery Failed",
        )
    )
    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.POST_FAILED,
            severity=ActivitySeverity.ERROR,
            title="Another Post Failed",
        )
    )
    await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.POST_PUBLISHED,
            severity=ActivitySeverity.SUCCESS,
            title="Post Published",
        )
    )

    assert await service.count_activities() == 3
    assert await service.count_activities(activity_type=ActivityType.POST_FAILED) == 2
    assert await service.count_activities(severity=ActivitySeverity.ERROR) == 2
    assert await service.count_activities(severity=ActivitySeverity.WARNING) == 0


@pytest.mark.anyio
async def test_purge_logs_retention_policy(db_session: AsyncSession):
    service = HistoryService(db_session)

    # 1. Create a current log
    current_log = await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.SYSTEM_QUOTA_RESET,
            title="Daily Quotas Reset",
        )
    )

    # 2. Create an artificially aged log (older than 30 days)
    old_log = await service.log_activity(
        LogActivityCommand(
            activity_type=ActivityType.SYSTEM_REPLICA_SYNCED,
            title="Old Sync Log",
        )
    )
    old_log.created_at = datetime.now(UTC) - timedelta(days=60)
    await db_session.commit()

    # Purge entries older than 30 days
    purged_count = await service.purge_logs_older_than(days=30)
    assert purged_count == 1

    # Old log is gone, current log remains
    assert await service.get_by_id(old_log.id) is None
    assert await service.get_by_id(current_log.id) is not None
