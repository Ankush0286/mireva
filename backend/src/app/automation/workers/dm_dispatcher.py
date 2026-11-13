import logging
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation.throttler import account_throttler
from app.common.enums import ActivitySeverity, ActivityType, OutreachMessageStatus
from app.db.session import async_session_factory
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


async def _claim_dm_for_dispatch(db: AsyncSession, message_id: UUID) -> bool:
    """
    Atomic claim guard: Transitions DM to DISPATCHED state only if currently APPROVED.
    Prevents duplicate DM delivery across concurrent workers.
    """
    stmt = (
        update(OutreachMessage)
        .where(
            OutreachMessage.id == message_id,
            OutreachMessage.status == OutreachMessageStatus.APPROVED,
        )
        .values(status=OutreachMessageStatus.DISPATCHED)
    )
    result = await db.execute(stmt)
    await db.commit()
    return getattr(result, "rowcount", 0) > 0


async def _dispatch_single_dm(
    db: AsyncSession,
    message: OutreachMessage,
    outreach_service: OutreachService,
    account_service: AccountService,
    history_service: HistoryService,
) -> bool:
    account = message.account
    lead = message.lead
    message_id = message.id
    account_id = account.id

    # 1. Anti-Ban Quota & Cooldown Safety Checks
    if not account.can_send_dm_today():
        logger.warning(
            "Account @%s cannot send DMs today (quota or cooldown). Skipping message %s to @%s.",
            account.handle,
            message_id,
            lead.handle,
        )
        return False

    # 2. Acquire anti-ban pacing slot
    acquired = await account_throttler.wait_and_acquire(account_id, max_wait_seconds=5.0)
    if not acquired:
        logger.info(
            "Account @%s throttled for anti-ban pacing. Deferring message %s.",
            account.handle,
            message_id,
        )
        return False

    # 3. Atomically claim DM (Prevents concurrent duplicate sends)
    claimed = await _claim_dm_for_dispatch(db, message_id)
    if not claimed:
        logger.debug("DM %s was already dispatched or modified. Skipping.", message_id)
        return False

    # Extract strings into memory
    recipient_handle = lead.handle
    message_text = message.content
    account_handle = account.handle
    account_platform = account.platform.value

    # 4. Execute Platform Adapter
    try:
        adapter = PlatformRegistry.get_adapter(account)
        logger.info(
            "Dispatching cold DM %s via %s adapter to @%s...",
            message_id,
            account_platform,
            recipient_handle,
        )

        try:
            thread_id = await adapter.send_dm(
                recipient_handle=recipient_handle,
                message_text=message_text,
            )
        finally:
            await adapter.close()

        # 5. Finalize delivery, update daily DM quota, and advance lead stage
        await outreach_service.record_delivery(
            RecordMessageDeliveryCommand(
                message_id=message_id,
                platform_message_id=thread_id,
            )
        )

        await history_service.log_activity(
            LogActivityCommand(
                activity_type=ActivityType.MESSAGE_DISPATCHED,
                severity=ActivitySeverity.SUCCESS,
                title=f"Cold DM sent on {account_platform}",
                description=f"Sent to @{recipient_handle} from @{account_handle}.",
                entity_type="outreach_message",
                entity_id=message_id,
                actor="dm_dispatcher",
            )
        )
        logger.info(
            "✅ Cold DM %s dispatched to @%s (Thread: %s)", message_id, recipient_handle, thread_id
        )
        return True

    except BaseException as exc:
        logger.error(
            "Failed to dispatch cold DM %s to @%s: %s",
            message_id,
            recipient_handle,
            exc,
            exc_info=True,
        )
        await db.rollback()
        try:
            await outreach_service.record_failure(
                RecordMessageFailureCommand(
                    message_id=message_id,
                    error_message=str(exc) or type(exc).__name__,
                )
            )
            await history_service.log_activity(
                LogActivityCommand(
                    activity_type=ActivityType.MESSAGE_REJECTED,
                    severity=ActivitySeverity.ERROR,
                    title=f"Cold DM delivery failed on {account_platform}",
                    description=str(exc) or type(exc).__name__,
                    entity_type="outreach_message",
                    entity_id=message_id,
                    actor="dm_dispatcher",
                )
            )
        except Exception:
            pass

        if isinstance(exc, Exception):
            return False
        raise


async def run_dm_dispatcher(db: AsyncSession | None = None) -> int:
    owns_session = db is None
    session = db if db is not None else async_session_factory()
    dispatched_count = 0

    try:
        outreach_service = OutreachService(session)
        account_service = AccountService(session)
        history_service = HistoryService(session)

        approved_messages = await outreach_service.list_messages(
            status=OutreachMessageStatus.APPROVED,
            limit=10,
        )
        if not approved_messages:
            return 0

        logger.info(
            "DMDispatcher: Found %d approved cold DMs ready for delivery.", len(approved_messages)
        )

        for msg in approved_messages:
            try:
                success = await _dispatch_single_dm(
                    db=session,
                    message=msg,
                    outreach_service=outreach_service,
                    account_service=account_service,
                    history_service=history_service,
                )
                if success:
                    dispatched_count += 1
            except Exception as iter_exc:
                logger.error("Error processing DM %s: %s", msg.id, iter_exc, exc_info=True)
                await session.rollback()

        return dispatched_count

    finally:
        if owns_session:
            await session.close()
