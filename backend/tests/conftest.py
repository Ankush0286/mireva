import os
from collections.abc import AsyncGenerator, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import String, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

# Guarantee test environment variables are set before application settings load
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-bytes-long-123456")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import app.db.session as app_db_session
from app.common.base_models import AuditBase
from app.core.security import _get_fernet_cipher
from app.db import all_models  # noqa: F401 - ensures all domain models register with Base.metadata
from app.db.base import Base
from app.db.dependencies import get_db_session
from app.main import app as fastapi_app

# =============================================================================
# Test-Only Models
# =============================================================================


class SampleItem(AuditBase):
    """Concrete model inheriting from AuditBase for testing UUIDs and timestamps."""

    __tablename__ = "sample_items"
    __table_args__ = {"extend_existing": True}

    name: Mapped[str | None] = mapped_column(String(100), nullable=True)


# =============================================================================
# Pytest Async Backend Fixture
# =============================================================================


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


# =============================================================================
# Security & Cache Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def clear_cipher_cache():
    """Clears the lru_cache on the Fernet cipher before and after each test."""
    _get_fernet_cipher.cache_clear()
    yield
    _get_fernet_cipher.cache_clear()


# =============================================================================
# Async Database Fixtures
# =============================================================================


# CHANGED: scope="function" ensures the engine is built inside the same event loop as the test!
@pytest.fixture(scope="function")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    """
    Creates a single in-memory SQLite async engine shared across the test function.
    Uses StaticPool so all connections within a test share the exact same in-memory state.
    Rebinds app_db_session.async_session_factory so direct calls inside routes also use
    this test database.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Rebind application-level factories to test_engine
    app_db_session.async_engine = engine
    app_db_session.engine = engine
    app_db_session.async_session_factory.configure(bind=engine)
    app_db_session.session_factory = app_db_session.async_session_factory

    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA foreign_keys=ON;"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Provides an isolated transactional async database session per test function.
    Automatically rolls back any committed or uncommitted changes upon exit,
    keeping every test completely isolated.
    """
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )

        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()
                if transaction.is_active:
                    await transaction.rollback()


# =============================================================================
# HTTP & WebSocket Test Client Fixtures
# =============================================================================


@pytest.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Provides an async HTTP client (httpx.AsyncClient with ASGITransport)
    with `get_db_session` overridden to use the isolated per-test `db_session`.
    """

    async def _override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    fastapi_app.dependency_overrides[get_db_session] = _override_get_db_session

    # SET raise_app_exceptions=False so 500 errors can be tested!
    transport = ASGITransport(app=fastapi_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def ws_client(db_session: AsyncSession) -> Generator[TestClient, None, None]:
    """
    Provides a Starlette TestClient with `get_db_session` overridden to use
    the isolated per-test `db_session`. Used specifically for WebSocket upgrade tests.
    """

    async def _override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    fastapi_app.dependency_overrides[get_db_session] = _override_get_db_session

    with TestClient(app=fastapi_app, base_url="http://test") as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()
