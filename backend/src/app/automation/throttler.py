import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class AccountBucket:
    capacity: float = 3.0
    tokens: float = 3.0
    refill_rate: float = 1.0 / 60.0  # 1 token per 60 seconds
    last_refill: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_action_at: datetime | None = None
    min_interval_seconds: float = 30.0  # Safe anti-ban minimum interval between actions


class AccountThrottler:
    """
    In-memory, async token bucket rate limiter and anti-ban pacer.
    Prevents triggering platform bot detection from rapid back-to-back actions.
    """

    def __init__(self, default_min_interval: float = 30.0):
        self.default_min_interval = default_min_interval
        self._buckets: dict[str, AccountBucket] = {}
        self._lock = asyncio.Lock()

    def _get_key(self, account_id: UUID | str) -> str:
        return str(account_id)

    def _refill(self, bucket: AccountBucket, now: datetime) -> None:
        elapsed = (now - bucket.last_refill).total_seconds()
        if elapsed > 0:
            bucket.tokens = min(bucket.capacity, bucket.tokens + (elapsed * bucket.refill_rate))
            bucket.last_refill = now

    async def can_perform_action(self, account_id: UUID | str) -> bool:
        key = self._get_key(account_id)
        now = datetime.now(UTC)

        async with self._lock:
            bucket = self._buckets.setdefault(
                key, AccountBucket(min_interval_seconds=self.default_min_interval)
            )
            self._refill(bucket, now)

            if bucket.last_action_at:
                spacing = (now - bucket.last_action_at).total_seconds()
                if spacing < bucket.min_interval_seconds:
                    return False

            return bucket.tokens >= 1.0

    async def wait_and_acquire(
        self, account_id: UUID | str, max_wait_seconds: float = 60.0
    ) -> bool:
        key = self._get_key(account_id)
        start_time = datetime.now(UTC)

        while (datetime.now(UTC) - start_time).total_seconds() < max_wait_seconds:
            if await self.can_perform_action(account_id):
                async with self._lock:
                    bucket = self._buckets[key]
                    bucket.tokens -= 1.0
                    bucket.last_action_at = datetime.now(UTC)
                    logger.debug("Throttler slot acquired for account %s", key)
                    return True
            await asyncio.sleep(2.0)

        logger.warning("Throttler timed out waiting for account %s slot", key)
        return False

    async def record_action(self, account_id: UUID | str) -> None:
        key = self._get_key(account_id)
        now = datetime.now(UTC)

        async with self._lock:
            bucket = self._buckets.setdefault(
                key, AccountBucket(min_interval_seconds=self.default_min_interval)
            )
            self._refill(bucket, now)
            bucket.tokens = max(0.0, bucket.tokens - 1.0)
            bucket.last_action_at = now

    async def reset(self, account_id: UUID | str) -> None:
        key = self._get_key(account_id)
        async with self._lock:
            if key in self._buckets:
                del self._buckets[key]


account_throttler = AccountThrottler()
