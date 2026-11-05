from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.common.enums import ConnectorStatus, ConnectorType
from app.modules.connectors.commands import (
    CreateConnectorCommand,
    UpdateConnectorCommand,
)

# =============================================================================
# Ingress / Request Schemas (HTTP Inbound)
# =============================================================================


class ConnectorCreateRequest(BaseModel):
    """Payload accepted by POST /api/v1/connectors/"""

    name: str = Field(
        ...,
        min_length=1,
        max_length=150,
        examples=["Primary Brand Search Console", "Competitor Ahrefs Tracker"],
    )
    connector_type: ConnectorType = Field(
        ...,
        description="Data source provider",
        examples=[ConnectorType.GOOGLE_SEARCH_CONSOLE],
    )
    target_identifier: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Target site URL, property ID, or competitor domain",
        examples=["https://growthcraft.ai", "sc-domain:growthcraft.ai", "competitor.com"],
    )
    sync_frequency_minutes: int = Field(
        default=360,
        ge=15,
        le=10080,
        description="Interval between automated background syncs (15 min - 7 days)",
    )

    # Plaintext credentials provided by user in UI (encrypted by service)
    api_key: str | None = Field(None, description="API Key for Ahrefs / DataForSEO")
    access_token: str | None = Field(None, description="OAuth user access token")
    refresh_token: str | None = Field(None, description="OAuth refresh token")
    client_id: str | None = Field(None, description="OAuth client ID")
    client_secret: str | None = Field(None, description="OAuth client secret")
    extra_metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_credential_presence(self) -> "ConnectorCreateRequest":
        clean_target = self.target_identifier.strip()
        if not clean_target:
            raise ValueError("target_identifier cannot be empty or whitespace")
        self.target_identifier = clean_target

        has_api_key = bool(self.api_key and self.api_key.strip())
        has_oauth = bool(self.refresh_token and self.refresh_token.strip())
        has_meta_auth = bool(self.extra_metadata.get("auth_configured"))

        if not (has_api_key or has_oauth or has_meta_auth):
            raise ValueError(
                "Must provide an API key, OAuth refresh token, or configured auth metadata."
            )
        return self

    def to_command(self) -> CreateConnectorCommand:
        return CreateConnectorCommand(
            name=self.name.strip(),
            connector_type=self.connector_type,
            target_identifier=self.target_identifier,
            sync_frequency_minutes=self.sync_frequency_minutes,
            api_key=self.api_key.strip() if self.api_key else None,
            access_token=self.access_token.strip() if self.access_token else None,
            refresh_token=self.refresh_token.strip() if self.refresh_token else None,
            client_id=self.client_id.strip() if self.client_id else None,
            client_secret=self.client_secret.strip() if self.client_secret else None,
            extra_metadata=self.extra_metadata,
        )


class ConnectorUpdateRequest(BaseModel):
    """Payload accepted by PATCH /api/v1/connectors/{connector_id}"""

    name: str | None = Field(None, min_length=1, max_length=150)
    target_identifier: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None
    status: ConnectorStatus | None = None
    sync_frequency_minutes: int | None = Field(None, ge=15, le=10080)
    api_key: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    extra_metadata: dict[str, Any] | None = None

    def to_command(self, connector_id: UUID) -> UpdateConnectorCommand:
        return UpdateConnectorCommand(
            connector_id=connector_id,
            **self.model_dump(exclude_unset=True),
        )


# =============================================================================
# Egress / Response Schemas (HTTP Outbound)
# =============================================================================


class ConnectorResponse(BaseModel):
    """
    Sanitized public view of a data connector.
    All sensitive tokens are completely excluded from serialization.
    """

    id: UUID
    name: str
    connector_type: ConnectorType
    target_identifier: str
    status: ConnectorStatus
    is_active: bool
    sync_frequency_minutes: int
    last_synced_at: datetime | None = None
    last_error_message: str | None = None
    extra_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MetricOpportunityItem(BaseModel):
    """Normalized high-signal marketing opportunity returned to the UI and agent."""

    query: str = Field(..., description="Target search query or topic keyword")
    page_url: str | None = Field(None, description="Ranking landing page URL")
    impressions: int | None = None
    clicks: int | None = None
    ctr: float | None = None
    position: float | None = None
    opportunity_type: str = Field(
        default="striking_distance",
        description="'striking_distance', 'keyword_gap', or 'high_volume'",
    )
    score: float = Field(default=0.0, description="Calculated priority score (0-100)")
