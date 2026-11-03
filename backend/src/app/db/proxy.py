import logging
from typing import Any

logger = logging.getLogger(__name__)


class LibSqlProxyCursor:
    """
    Proxy wrapper around a libSQL cursor to ensure full PEP 249 compatibility
    and graceful attribute fallbacks for SQLAlchemy introspection.
    """

    def __init__(self, raw_cursor: Any, proxy_conn: "LibSqlProxyConnection"):
        self._cursor = raw_cursor
        self._proxy_conn = proxy_conn

    @property
    def connection(self) -> "LibSqlProxyConnection":
        """SQLAlchemy occasionally references cursor.connection to verify dialect state."""
        return self._proxy_conn

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


class LibSqlProxyConnection:
    """
    Proxy wrapper around a native libSQL / Turso connection.

    1. Intercepts SQLAlchemy's dialect initialization call to `create_function`.
    2. Exposes `.sync()` so the application can manually sync the local embedded replica.
    3. Traps native Rust panics (called Option::unwrap() on None) when SQLAlchemy
       executes pool clean-up rollbacks on idle connections.
    """

    def __init__(self, raw_connection: Any):
        self._conn = raw_connection

    def create_function(
        self,
        name: str,
        _num_params: int,
        _func: Any,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        """
        Intercepts SQLite function creation from SQLAlchemy.
        libSQL does not support dynamic Python-side function registration.
        """
        logger.debug("Intercepted unsupported SQLite create_function: %s", name)

    def cursor(self, *args: Any, **kwargs: Any) -> LibSqlProxyCursor:
        """Returns a wrapped cursor pointing back to this proxy connection."""
        try:
            raw_cursor = self._conn.cursor(*args, **kwargs)
            return LibSqlProxyCursor(raw_cursor, self)
        except BaseException as exc:
            logger.warning("libsql cursor acquisition handled: %s", exc)
            raise

    def sync(self) -> None:
        """
        Pushes local writes to Turso Cloud and pulls latest upstream changes.
        """
        if hasattr(self._conn, "sync"):
            try:
                self._conn.sync()
                logger.debug("Turso embedded replica successfully synced with cloud.")
            except BaseException as exc:
                logger.warning("libSQL sync skipped: %s", exc)
        else:
            logger.warning("libSQL connection does not support sync (running offline/local mode).")

    def commit(self) -> None:
        try:
            self._conn.commit()
        except BaseException as exc:
            # Suppress native Rust panic if no transaction was open
            logger.debug("Suppressed idle commit: %s", exc)

    def rollback(self) -> None:
        try:
            self._conn.rollback()
        except BaseException as exc:
            # Trap native Rust panic: called Option::unwrap() on a None value
            logger.debug("Suppressed idle rollback panic: %s", exc)

    def close(self) -> None:
        try:
            self._conn.close()
        except BaseException as exc:
            logger.debug("Suppressed close exception: %s", exc)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)
