import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import (
    get_db_session,
    sync_replica,
)


def test_supabase_pooler_cache_disabling():
    """
    Supabase PgBouncer / Supavisor pooler on port 6543 requires statement caches
    to be zeroed to prevent prepared statement collisions.
    """
    from app.db.session import connect_args, db_url

    if ":6543" in db_url:
        assert connect_args.get("prepared_statement_cache_size") == 0
        assert connect_args.get("statement_cache_size") == 0


@pytest.mark.anyio
async def test_get_db_session_lifecycle():
    """Verify get_db_session yields an active AsyncSession and closes cleanly."""
    session_gen = get_db_session()
    session = await anext(session_gen)

    assert isinstance(session, AsyncSession)
    assert session.is_active

    # Generator terminates cleanly upon completion
    with pytest.raises(StopAsyncIteration):
        await anext(session_gen)


@pytest.mark.anyio
async def test_session_transaction_rollback_on_error(db_session: AsyncSession):
    """Verify transactional safety: rolled back operations leave no trace in database."""
    await db_session.execute(text("CREATE TABLE IF NOT EXISTS temp_audit (id INT, note TEXT);"))
    await db_session.commit()

    try:
        await db_session.execute(text("INSERT INTO temp_audit VALUES (1, 'initial');"))
        raise RuntimeError("Simulated crash mid-transaction")
    except RuntimeError:
        await db_session.rollback()

    result = await db_session.execute(text("SELECT COUNT(*) FROM temp_audit;"))
    count = result.scalar()
    assert count == 0


@pytest.mark.anyio
async def test_session_raw_query_execution(db_session: AsyncSession):
    """Verify active database responsiveness with a basic scalar query."""
    val = await db_session.scalar(text("SELECT 42;"))
    assert val == 42


@pytest.mark.anyio
async def test_sync_replica_compatibility():
    """Verify sync_replica() executes as an async no-op in PostgreSQL architecture."""
    # Must run without raising errors
    await sync_replica()
