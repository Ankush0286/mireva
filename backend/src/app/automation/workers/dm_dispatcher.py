import logging

from sqlalchemy.orm import Session

from app.automation.throttler import account_throttler
from app.common.enums import ActivitySeverity, ActivityType, OutreachMessageStatus
from app.db.session import session_factory
from app.modules.accounts.service import AccountService
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService
from app.modules.outreach.commands import (
    RecordMessageDeliveryCommand,
    RecordMessageFailureCommand,
)
from app.modules.outreach.models import OutreachMessage
from app.modules.outreach.service import OutreachService
from app.platforms.registry import PlatformRegistry

logger = logging.getLogger(__name__)


async def _dispatch_single_dm(
    db: Session,
    message: OutreachMessage,
    outreach_service: OutreachService,
    account_service: AccountService,
    history_service: HistoryService,
) -> bool:
    """Delivers a single approved cold DM while enforcing anti-ban pacing."""
    account = message.account
    lead = message.lead

    # 1. Anti-Ban Quota & Cooldown Safety Checks
    if not account.can_send_dm_today():
        logger.warning(
            "Account @%s cannot send DMs today (quota or cooldown). Skipping message %s to @%s.",
            account.handle,
            message.id,
            lead.handle,
        )
        return False

    # 2. Acquire anti-ban pacing slot (30s interval)
    acquired = await account_throttler.wait_and_acquire(account.id, max_wait_seconds=5.0)
    if not acquired:
        logger.info(
            "Account @%s throttled for anti-ban pacing. Deferring message %s.",
            account.handle,
            message.id,
        )
        return False

    # 3. Execute Platform Adapter (Recorded send_dm recipe or native fallback)
    try:
        adapter = PlatformRegistry.get_adapter(account)
        logger.info(
            "Dispatching cold DM %s via %s adapter to @%s...",
            message.id,
            account.platform.value,
            lead.handle,
        )

        try:
            thread_id = await adapter.send_dm(
                recipient_handle=lead.handle,
                message_text=message.content,
            )
        finally:
            await adapter.close()

        # 4. Finalize delivery, increment account daily DM count, and advance lead stage to CONTACTED
        outreach_service.record_delivery(
            RecordMessageDeliveryCommand(
                message_id=message.id,
                platform_message_id=thread_id,
            )
        )

        history_service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.MESSAGE_DISPATCHED,
                severity=ActivitySeverity.SUCCESS,
                title=f"Cold DM sent on {account.platform.value}",
                description=f"Sent to @{lead.handle} from @{account.handle}.",
                entity_type="outreach_message",
                entity_id=message.id,
                actor="dm_dispatcher",
            )
        )
        logger.info("✅ Cold DM %s dispatched to @%s (Thread: %s)", message.id, lead.handle, thread_id)
        return True

    except Exception as exc:
        logger.error(
            "Failed to dispatch cold DM %s to @%s: %s",
            message.id,
            lead.handle,
            exc,
            exc_info=True,
        )
        outreach_service.record_failure(
            RecordMessageFailureCommand(
                message_id=message.id,
                error_message=str(exc),
            )
        )
        history_service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.MESSAGE_REJECTED,
                severity=ActivitySeverity.ERROR,
                title=f"Cold DM delivery failed on {account.platform.value}",
                description=str(exc),
                entity_type="outreach_message",
                entity_id=message.id,
                actor="dm_dispatcher",
            )
        )
        return False


async def run_dm_dispatcher(db: Session | None = None) -> int:
    """
    Automated background worker loop:
    1. Fetches approved cold DMs awaiting delivery.
    2. Dispatches each DM respecting anti-ban limits.
    3. Updates account quotas, lead CRM stages, and audit logs.
    """
    owns_session = db is None
    session = db or session_factory()
    dispatched_count = 0

    try:
        outreach_service = OutreachService(session)
        account_service = AccountService(session)
        history_service = HistoryService(session)

        approved_messages = outreach_service.list_messages(
            status=OutreachMessageStatus.APPROVED,
            limit=10,
        )
        if not approved_messages:
            return 0

        logger.info("DMDispatcher: Found %d approved cold DMs ready for delivery.", len(approved_messages))

        for msg in approved_messages:
            success = await _dispatch_single_dm(
                db=session,
                message=msg,
                outreach_service=outreach_service,
                account_service=account_service,
                history_service=history_service,
            )
            if success:
                dispatched_count += 1

        return dispatched_count

    finally:
        if owns_session:
            session.close()
