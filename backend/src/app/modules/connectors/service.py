import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ConnectorType
from app.core.security import decrypt_token, encrypt_token
from app.modules.connectors.commands import (
    CreateConnectorCommand,
    UpdateConnectorCommand,
)
from app.modules.connectors.exceptions import (
    ConnectorAlreadyExistsError,
    ConnectorNotFoundError,
    InvalidConnectorConfigError,
)
from app.modules.connectors.models import DataConnector
from app.modules.connectors.providers import resolve_provider
from app.modules.connectors.schemas import MetricOpportunityItem

logger = logging.getLogger(__name__)


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class ConnectorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ================= Query Methods =================

    async def get_by_id(self, connector_id: UUID | str) -> DataConnector | None:
        target_id = _ensure_uuid(connector_id)
        stmt = select(DataConnector).where(DataConnector.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_id_or_raise(self, connector_id: UUID | str) -> DataConnector:
        connector = await self.get_by_id(connector_id)
        if not connector:
            raise ConnectorNotFoundError(connector_id)
        return connector

    async def get_by_type_and_target(
        self, connector_type: ConnectorType, target_identifier: str
    ) -> DataConnector | None:
        clean_target = target_identifier.strip()
        stmt = select(DataConnector).where(
            DataConnector.connector_type == connector_type,
            DataConnector.target_identifier == clean_target,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_connectors(
        self,
        connector_type: ConnectorType | None = None,
        active_only: bool = False,
    ) -> list[DataConnector]:
        stmt = select(DataConnector).order_by(DataConnector.created_at.desc())
        if connector_type is not None:
            stmt = stmt.where(DataConnector.connector_type == connector_type)
        if active_only:
            stmt = stmt.where(DataConnector.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ================= Mutations =================

    async def create_connector(self, cmd: CreateConnectorCommand) -> DataConnector:
        clean_target = cmd.target_identifier.strip()
        existing = await self.get_by_type_and_target(cmd.connector_type, clean_target)
        if existing:
            raise ConnectorAlreadyExistsError(cmd.connector_type.value, clean_target)

        connector = DataConnector(
            name=cmd.name.strip(),
            connector_type=cmd.connector_type,
            target_identifier=clean_target,
            sync_frequency_minutes=cmd.sync_frequency_minutes,
            encrypted_api_key=encrypt_token(cmd.api_key) if cmd.api_key else None,
            encrypted_access_token=encrypt_token(cmd.access_token) if cmd.access_token else None,
            encrypted_refresh_token=encrypt_token(cmd.refresh_token) if cmd.refresh_token else None,
            encrypted_client_id=encrypt_token(cmd.client_id) if cmd.client_id else None,
            encrypted_client_secret=encrypt_token(cmd.client_secret) if cmd.client_secret else None,
            token_expires_at=cmd.token_expires_at,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(connector)
        await self.db.commit()
        await self.db.refresh(connector)
        return connector

    async def update_connector(self, cmd: UpdateConnectorCommand) -> DataConnector:
        connector = await self.get_by_id_or_raise(cmd.connector_id)

        if cmd.name is not None:
            connector.name = cmd.name.strip()
        if cmd.target_identifier is not None:
            connector.target_identifier = cmd.target_identifier.strip()
        if cmd.is_active is not None:
            connector.is_active = cmd.is_active
        if cmd.status is not None:
            connector.status = cmd.status
        if cmd.sync_frequency_minutes is not None:
            connector.sync_frequency_minutes = cmd.sync_frequency_minutes
        if cmd.extra_metadata is not None:
            connector.extra_metadata = cmd.extra_metadata

        if cmd.api_key is not None:
            connector.encrypted_api_key = encrypt_token(cmd.api_key) if cmd.api_key else None
        if cmd.access_token is not None:
            connector.encrypted_access_token = encrypt_token(cmd.access_token) if cmd.access_token else None
        if cmd.refresh_token is not None:
            connector.encrypted_refresh_token = encrypt_token(cmd.refresh_token) if cmd.refresh_token else None
        if cmd.client_secret is not None:
            connector.encrypted_client_secret = encrypt_token(cmd.client_secret) if cmd.client_secret else None

        await self.db.commit()
        await self.db.refresh(connector)
        return connector

    async def delete_connector(self, connector_id: UUID | str) -> None:
        connector = await self.get_by_id_or_raise(connector_id)
        await self.db.delete(connector)
        await self.db.commit()

    # ================= Security & Provider Execution =================

    def get_decrypted_credentials(self, connector: DataConnector) -> dict[str, str | None]:
        return {
            "api_key": decrypt_token(connector.encrypted_api_key),
            "access_token": decrypt_token(connector.encrypted_access_token),
            "refresh_token": decrypt_token(connector.encrypted_refresh_token),
            "client_id": decrypt_token(connector.encrypted_client_id),
            "client_secret": decrypt_token(connector.encrypted_client_secret),
        }

    async def test_connection(self, connector_id: UUID | str) -> bool:
        connector = await self.get_by_id_or_raise(connector_id)
        credentials = self.get_decrypted_credentials(connector)
        provider = resolve_provider(connector, credentials)

        try:
            is_valid = await provider.test_connection()
            if is_valid:
                connector.mark_synced()
            else:
                connector.mark_error("Credentials rejected by external service.", is_auth_error=True)
            await self.db.commit()
            return is_valid
        except Exception as exc:
            connector.mark_error(str(exc), is_auth_error=True)
            await self.db.commit()
            raise

    async def fetch_opportunities(
        self,
        connector_id: UUID | str,
        min_impressions: int = 200,
        limit: int = 20,
    ) -> list[MetricOpportunityItem]:
        connector = await self.get_by_id_or_raise(connector_id)

        if not connector.is_active:
            raise InvalidConnectorConfigError(f"Connector '{connector.name}' is currently paused.")

        credentials = self.get_decrypted_credentials(connector)
        provider = resolve_provider(connector, credentials)

        try:
            raw_opps = await provider.fetch_opportunities(
                min_impressions=min_impressions,
                limit=limit,
            )
            connector.mark_synced()
            await self.db.commit()

            return [MetricOpportunityItem(**item) for item in raw_opps]
        except Exception as exc:
            connector.mark_error(str(exc))
            await self.db.commit()
            raise
