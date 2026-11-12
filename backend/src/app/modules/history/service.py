from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ActivitySeverity, ActivityType
from app.modules.history.commands import LogActivityCommand
from app.modules.history.exceptions import ActivityLogNotFoundError
from app.modules.history.models import ActivityLog


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class HistoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Query Methods
    # =========================================================================

    async def get_by_id(self, log_id: UUID | str) -> ActivityLog | None:
        target_id = _ensure_uuid(log_id)
        stmt = select(ActivityLog).where(ActivityLog.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_id_or_raise(self, log_id: UUID | str) -> ActivityLog:
        log = await self.get_by_id(log_id)
        if not log:
            raise ActivityLogNotFoundError(log_id)
        return log

    async def list_activities(
        self,
        activity_type: ActivityType | None = None,
        severity: ActivitySeverity | None = None,
        entity_type: str | None = None,
        entity_id: UUID | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ActivityLog]:
        stmt = select(ActivityLog).order_by(ActivityLog.created_at.desc())

        if activity_type is not None:
            stmt = stmt.where(ActivityLog.activity_type == activity_type)
        if severity is not None:
            stmt = stmt.where(ActivityLog.severity == severity)
        if entity_type is not None:
            stmt = stmt.where(ActivityLog.entity_type == entity_type)
        if entity_id is not None:
            stmt = stmt.where(ActivityLog.entity_id == entity_id)

        if since is not None:
            since_utc = since.replace(tzinfo=UTC) if since.tzinfo is None else since
            stmt = stmt.where(ActivityLog.created_at >= since_utc)

        if until is not None:
            until_utc = until.replace(tzinfo=UTC) if until.tzinfo is None else until
            stmt = stmt.where(ActivityLog.created_at <= until_utc)

        result = await self.db.execute(stmt.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def count_activities(
        self,
        activity_type: ActivityType | None = None,
        severity: ActivitySeverity | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(ActivityLog)
        if activity_type is not None:
            stmt = stmt.where(ActivityLog.activity_type == activity_type)
        if severity is not None:
            stmt = stmt.where(ActivityLog.severity == severity)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    # =========================================================================
    # Mutation Methods
    # =========================================================================

    async def log_activity(self, cmd: LogActivityCommand) -> ActivityLog:
        log = ActivityLog(
            activity_type=cmd.activity_type,
            title=cmd.title,
            severity=cmd.severity,
            description=cmd.description,
            entity_type=cmd.entity_type,
            entity_id=cmd.entity_id,
            actor=cmd.actor,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def purge_logs_older_than(self, days: int = 90) -> int:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        # Add synchronize_session=False so SQLAlchemy doesn't try to evaluate
        # the datetime comparison in Python memory for SQLite.
        stmt = (
            delete(ActivityLog)
            .where(ActivityLog.created_at < cutoff)
            .execution_options(synchronize_session=False)
        )

        result = await self.db.execute(stmt)
        await self.db.commit()
        return getattr(result, "rowcount", 0)
