from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base_models import AuditBase
from app.common.enums import ConnectorStatus, ConnectorType


class DataConnector(AuditBase):
    """
    Persisted configuration and encrypted authentication credentials for
    external data sources (Google Search Console, Ahrefs, GA4, PostHog, etc.).
    """

    __tablename__ = "data_connectors"

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        index=True,
    )
    connector_type: Mapped[ConnectorType] = mapped_column(
        SAEnum(ConnectorType, native_enum=False),
        nullable=False,
        index=True,
    )

    # Target resource or property (e.g., "https://mybrand.com", "sc-domain:example.com", or "competitor.com")
    target_identifier: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )

    status: Mapped[ConnectorStatus] = mapped_column(
        SAEnum(ConnectorStatus, native_enum=False),
        default=ConnectorStatus.CONNECTED,
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # --------------- Encrypted Credential Vault ---------------
    # Stored encrypted with Fernet AES-128; decrypted only in-memory during sync
    encrypted_api_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    encrypted_access_token: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    encrypted_refresh_token: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    encrypted_client_id: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    encrypted_client_secret: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --------------- Sync Scheduling & Health Diagnostics ---------------
    sync_frequency_minutes: Mapped[int] = mapped_column(
        Integer,
        default=360,  # Default sync interval: every 6 hours
        nullable=False,
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Provider-specific configurations (e.g., dimensions, country filters, property IDs)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "connector_type",
            "target_identifier",
            name="uq_connectors_type_target",
        ),
        Index("ix_connectors_status_type", "status", "connector_type"),
    )

    def is_healthy(self) -> bool:
        """Determines if connector credentials are live and ready for agent queries."""
        return self.is_active and self.status == ConnectorStatus.CONNECTED

    def mark_synced(self) -> None:
        """Updates timestamp upon successful data retrieval."""
        self.last_synced_at = datetime.now(UTC)
        self.status = ConnectorStatus.CONNECTED
        self.last_error_message = None

    def mark_error(self, error: str, is_auth_error: bool = False) -> None:
        """Logs diagnostic error and updates status."""
        self.last_error_message = error
        self.status = (
            ConnectorStatus.NEEDS_REAUTH if is_auth_error else ConnectorStatus.ERROR
        )
