import logging
from collections.abc import Generator
from pathlib import Path
from typing import Any

import libsql
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

from .proxy import LibSqlProxyConnection

logger = logging.getLogger(__name__)


def _ensure_local_db_dir() -> Path:
    """
    Ensures the parent directory for the local SQLite embedded replica exists
    before libSQL attempts to open or initialize the file.
    """
    db_path = Path(settings.LOCAL_DB_PATH).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def _create_libsql_connection() -> LibSqlProxyConnection:
    """
    Establishes an embedded replica connection using libSQL:
    - Reads and writes locally to disk (LOCAL_DB_PATH) with microsecond latency.
    - Synchronizes changes with Turso Cloud when sync_url and auth_token are configured.
    """
    db_path = _ensure_local_db_dir()

    if settings.TURSO_DATABASE_URL and settings.TURSO_AUTH_TOKEN:
        logger.debug("Connecting to Turso embedded replica at %s", db_path)
        raw_conn: Any = libsql.connect(
            database=str(db_path),
            sync_url=settings.TURSO_DATABASE_URL,
            auth_token=settings.TURSO_AUTH_TOKEN,
        )
        try:
            raw_conn.sync()
            logger.info("Turso embedded replica initialized and synced with cloud.")
        except Exception as exc:
            logger.warning(
                "Initial Turso cloud sync failed (falling back to offline local DB): %s",
                exc,
            )
    else:
        logger.debug("Connecting to local standalone libSQL database at %s", db_path)
        raw_conn = libsql.connect(database=str(db_path))

    return LibSqlProxyConnection(raw_conn)


# Use NullPool: Every Session gets a fresh, isolated connection that is closed
# when the session closes. This prevents native Rust thread-sharing panics.
engine = create_engine(
    "sqlite://",
    creator=_create_libsql_connection,
    echo=settings.DB_ECHO,
    poolclass=NullPool,
    future=True,
)

# Global Session Factory
session_factory: sessionmaker[Session] = sessionmaker(
    bind=engine,
    class_=Session,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields an isolated database session per request,
    rolling back transactions on error and closing the session on completion.
    """
    session: Session = session_factory()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def sync_replica() -> None:
    """
    Manually triggers synchronization between the local embedded replica and Turso Cloud.
    """
    try:
        with engine.connect() as conn:
            dbapi_conn: Any = conn.connection.dbapi_connection
            if dbapi_conn is not None and hasattr(dbapi_conn, "sync"):
                dbapi_conn.sync()
                logger.info("Turso replica sync completed successfully.")
            else:
                logger.warning("Active DBAPI connection does not support sync.")
    except Exception as exc:
        logger.error("Failed to sync Turso replica to cloud: %s", exc)
        raise
