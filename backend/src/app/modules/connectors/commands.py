from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from app.common.enums import ConnectorStatus, ConnectorType


@dataclass(frozen=True)
class CreateConnectorCommand:
    """Payload to register a new external data source in the encrypted vault."""

    name: str
    connector_type: ConnectorType
    target_identifier: str
    sync_frequency_minutes: int = 360
    api_key: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    token_expires_at: datetime | None = None
    extra_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class UpdateConnectorCommand:
    """Payload to modify configuration, status, or rotate credentials."""

    connector_id: UUID
    name: str | None = None
    target_identifier: str | None = None
    is_active: bool | None = None
    status: ConnectorStatus | None = None
    sync_frequency_minutes: int | None = None
    api_key: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    token_expires_at: datetime | None = None
    extra_metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class RecordConnectorSyncCommand:
    """Diagnostic outcome emitted after querying or testing an external provider."""

    connector_id: UUID
    status: ConnectorStatus
    error_message: str | None = None


@dataclass(frozen=True)
class QueryConnectorMetricsCommand:
    """Directive requesting distilled intelligence from a connected provider."""

    connector_id: UUID
    metric_type: str  # e.g., 'striking_distance', 'keyword_gaps', 'decaying_pages'
    parameters: dict[str, Any] = field(default_factory=dict)
