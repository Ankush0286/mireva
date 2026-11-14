import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ActivitySeverity, ActivityType
from app.db.session import async_session_factory, sync_replica
from app.modules.accounts.service import AccountService
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService

logger = logging.getLogger(__name__)


async def run_quota_reset_worker(db: AsyncSession | None = None) -> int:
    """
    Daily maintenance loop:
    1. Resets 24-hour post and DM quotas across connected accounts.
    2. Runs consistency check via sync_replica().
    """
    owns_session = db is None
    session = db if db is not None else async_session_factory()
    reset_count = 0

    try:
        account_service = AccountService(session)
        history_service = HistoryService(session)

        accounts = await account_service.list_accounts(auto_reset=False)

        for account in accounts:
            prev_posts = account.daily_posts_sent
            prev_dms = account.daily_dms_sent

            account._check_and_reset_daily_quotas()

            if (
                account.daily_posts_sent == 0
                and account.daily_dms_sent == 0
                and (prev_posts > 0 or prev_dms > 0)
            ):
                reset_count += 1
                logger.info(
                    "Reset 24-hour quotas for account @%s (%s)",
                    account.handle,
                    account.platform.value,
                )

        try:
            await session.commit()
        except Exception as commit_exc:
            await session.rollback()
            logger.error("Failed to commit quota resets: %s", commit_exc)
            raise

        if reset_count > 0:
            await history_service.log_activity(
                LogActivityCommand(
                    activity_type=ActivityType.SYSTEM_QUOTA_RESET,
                    severity=ActivitySeverity.INFO,
                    title="Daily quotas reset",
                    description=f"Reset counters for {reset_count} accounts.",
                    actor="quota_reset_worker",
                )
            )

        try:
            await sync_replica()
        except Exception as sync_exc:
            logger.warning("Cloud consistency check skipped: %s", sync_exc)

        return reset_count

    finally:
        if owns_session:
            await session.close()
