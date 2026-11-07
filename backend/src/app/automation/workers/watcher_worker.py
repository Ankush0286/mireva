import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ActivitySeverity, ActivityType
from app.db.session import async_session_factory
from app.modules.accounts.service import AccountService
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService
from app.modules.triggers.commands import EvaluateIncomingPostCommand
from app.modules.triggers.service import TriggerService
from app.platforms.registry import PlatformRegistry

logger = logging.getLogger(__name__)


async def run_watcher_worker(db: AsyncSession | None = None) -> int:
    """
    Periodic scraper polling loop:
    Evaluates competitor posts against trigger rules and logs opportunities.
    Guarantees that a single failing scrape does not abort remaining handles.
    """
    owns_session = db is None
    session = db if db is not None else async_session_factory()
    matches_created = 0

    try:
        trigger_service = TriggerService(session)
        account_service = AccountService(session)
        history_service = HistoryService(session)

        watched_handles = await trigger_service.list_watched_handles(active_only=True)
        if not watched_handles:
            return 0

        all_accounts = await account_service.list_accounts(active_only=True)
        now = datetime.now(UTC)

        for handle in watched_handles:
            # Check scraping frequency interval
            if handle.last_scraped_at:
                jitter = random.randint(-10, 25)
                effective_frequency = max(30, handle.scrape_frequency_minutes + jitter)
                cutoff = handle.last_scraped_at + timedelta(minutes=effective_frequency)
                if now < cutoff:
                    continue

            # Find active account to act as scraper
            scraper_accounts = [
                acc for acc in all_accounts
                if acc.platform == handle.platform and acc.status.value == "active"
            ]
            if not scraper_accounts:
                logger.debug(
                    "No active account available to scrape %s for @%s",
                    handle.platform.value,
                    handle.handle,
                )
                continue

            scraper_account = scraper_accounts[0]

            try:
                adapter = PlatformRegistry.get_adapter(scraper_account)
                logger.info("Watcher: Scraping @%s on %s...", handle.handle, handle.platform.value)

                try:
                    scraped_posts = await adapter.scrape_feed(handle.handle, limit=10)
                finally:
                    await adapter.close()

                # Evaluate posts against trigger rules
                for post in scraped_posts:
                    matches = await trigger_service.evaluate_incoming_post(
                        EvaluateIncomingPostCommand(
                            platform=handle.platform,
                            platform_post_id=post.platform_post_id,
                            author_handle=post.author_handle,
                            post_content=post.content,
                            platform_post_url=post.platform_post_url,
                            watched_handle_id=handle.id,
                        )
                    )
                    for match in matches:
                        matches_created += 1
                        await history_service.log_activity(
                            LogActivityCommand(
                                activity_type=ActivityType.TRIGGER_MATCHED,
                                severity=ActivitySeverity.INFO,
                                title=f"Opportunity detected from @{handle.handle}",
                                description=f"Matched keywords: {', '.join(match.matched_keywords)}",
                                entity_type="trigger_match",
                                entity_id=match.id,
                                actor="watcher_worker",
                            )
                        )

                # Update timestamp
                handle.last_scraped_at = now
                await session.commit()

            except Exception as exc:
                # Crucial rollback prevents poisoning subsequent handles in asyncpg
                await session.rollback()
                logger.error("Watcher failed scraping @%s: %s", handle.handle, exc, exc_info=True)

        return matches_created

    finally:
        if owns_session:
            await session.close()
