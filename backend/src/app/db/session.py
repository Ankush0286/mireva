import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


# Determine connection arguments
connect_args: dict[str, Any] = {}
db_url = settings.DATABASE_URL

# Supabase Supavisor / PgBouncer pooler (port 6543) requires disabling prepared statements
if ":6543" in db_url:
    connect_args["prepared_statement_cache_size"] = 0
    connect_args["statement_cache_size"] = 0

# Core Async SQLAlchemy Engine
engine_kwargs: dict[str, Any] = {
    "echo": settings.DB_ECHO,
    "future": True,
}

# SQLite (used in tests) does not support Postgres pool arguments
if not db_url.startswith("sqlite"):
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_kwargs["pool_pre_ping"] = True

async_engine = create_async_engine(
    db_url,
    connect_args=connect_args,
    **engine_kwargs,
)

# Async Session Factory
async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# Backwards-compatible aliases
engine = async_engine
session_factory = async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an isolated asynchronous database session per request,
    rolling back transactions on error and closing the session on completion.
    """
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def sync_replica() -> None:
    """
    No-op in PostgreSQL mode: writes are immediately consistent in the cloud.
    Preserved for background worker interface compatibility.
    """
    logger.debug("sync_replica invoked: no-op in PostgreSQL mode.")
