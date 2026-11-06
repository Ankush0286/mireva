from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from .session import async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an isolated async session per request."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
