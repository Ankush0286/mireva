from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.common.enums import ConnectorStatus, ConnectorType
from app.modules.connectors.commands import (
    CreateConnectorCommand,
    UpdateConnectorCommand,
)
from app.modules.connectors.exceptions import (
    ConnectorAlreadyExistsError,
    ConnectorNotFoundError,
    InvalidConnectorConfigError,
)
from app.modules.connectors.service import ConnectorService


def test_create_connector_encrypts_credentials(db_session: Session):
    service = ConnectorService(db_session)
    cmd = CreateConnectorCommand(
        name="Production Search Console",
        connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
        target_identifier="https://orlume.site",
        access_token="secret_plain_access_token",
        refresh_token="secret_plain_refresh_token",
        client_secret="secret_plain_client_secret",
    )

    connector = service.create_connector(cmd)

    # 1. Primary keys and metadata persisted
    assert connector.id is not None
    assert connector.name == "Production Search Console"
    assert connector.connector_type == ConnectorType.GOOGLE_SEARCH_CONSOLE
    assert connector.target_identifier == "https://orlume.site"

    # 2. Plaintext credentials MUST NOT be stored unencrypted
    assert connector.encrypted_access_token != "secret_plain_access_token"
    assert connector.encrypted_refresh_token != "secret_plain_refresh_token"
    assert connector.encrypted_client_secret != "secret_plain_client_secret"

    # 3. Decryption utility returns original plaintext
    decrypted = service.get_decrypted_credentials(connector)
    assert decrypted["access_token"] == "secret_plain_access_token"
    assert decrypted["refresh_token"] == "secret_plain_refresh_token"
    assert decrypted["client_secret"] == "secret_plain_client_secret"


def test_create_duplicate_connector_raises_conflict(db_session: Session):
    service = ConnectorService(db_session)
    cmd = CreateConnectorCommand(
        name="Primary Ahrefs",
        connector_type=ConnectorType.AHREFS,
        target_identifier="orlume.site",
        api_key="ahrefs-api-key-12345",
    )

    service.create_connector(cmd)

    # Attempting to register the same target identifier and provider type raises conflict
    with pytest.raises(ConnectorAlreadyExistsError):
        service.create_connector(cmd)


def test_get_nonexistent_connector_raises_not_found(db_session: Session):
    service = ConnectorService(db_session)
    with pytest.raises(ConnectorNotFoundError):
        service.get_by_id_or_raise(uuid4())


def test_update_connector_fields_and_rotate_credentials(db_session: Session):
    service = ConnectorService(db_session)
    created = service.create_connector(
        CreateConnectorCommand(
            name="Initial Connector",
            connector_type=ConnectorType.AHREFS,
            target_identifier="competitor.com",
            api_key="old-api-key",
            sync_frequency_minutes=360,
        )
    )

    updated = service.update_connector(
        UpdateConnectorCommand(
            connector_id=created.id,
            name="Renamed Connector",
            sync_frequency_minutes=720,
            api_key="rotated-new-api-key",
            status=ConnectorStatus.CONNECTED,
        )
    )

    assert updated.name == "Renamed Connector"
    assert updated.sync_frequency_minutes == 720
    assert updated.status == ConnectorStatus.CONNECTED

    decrypted = service.get_decrypted_credentials(updated)
    assert decrypted["api_key"] == "rotated-new-api-key"


def test_delete_connector(db_session: Session):
    service = ConnectorService(db_session)
    connector = service.create_connector(
        CreateConnectorCommand(
            name="To Delete",
            connector_type=ConnectorType.DATAFORSEO,
            target_identifier="delete-target.com",
            api_key="dummy-key",
        )
    )

    service.delete_connector(connector.id)
    assert service.get_by_id(connector.id) is None

    with pytest.raises(ConnectorNotFoundError):
        service.delete_connector(connector.id)


def test_list_connectors_with_filters(db_session: Session):
    service = ConnectorService(db_session)

    c1 = service.create_connector(
        CreateConnectorCommand(
            name="Active GSC",
            connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
            target_identifier="https://site1.com",
            refresh_token="tok1",
        )
    )
    c2 = service.create_connector(
        CreateConnectorCommand(
            name="Inactive Ahrefs",
            connector_type=ConnectorType.AHREFS,
            target_identifier="site2.com",
            api_key="tok2",
        )
    )
    service.update_connector(UpdateConnectorCommand(connector_id=c2.id, is_active=False))

    all_connectors = service.list_connectors(active_only=False)
    active_connectors = service.list_connectors(active_only=True)
    gsc_connectors = service.list_connectors(connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE)

    assert len(all_connectors) == 2
    assert len(active_connectors) == 1
    assert active_connectors[0].id == c1.id
    assert len(gsc_connectors) == 1
    assert gsc_connectors[0].id == c1.id


@pytest.mark.anyio
async def test_test_connection_provider_lifecycle(db_session: Session):
    service = ConnectorService(db_session)
    connector = service.create_connector(
        CreateConnectorCommand(
            name="GSC Health Check",
            connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
            target_identifier="https://healthy-site.com",
            refresh_token="valid_token",
        )
    )

    # 1. Test Successful Provider Verification
    with patch("app.modules.connectors.service.resolve_provider") as mock_resolve:
        mock_provider = AsyncMock()
        mock_provider.test_connection.return_value = True
        mock_resolve.return_value = mock_provider

        is_valid = await service.test_connection(connector.id)
        assert is_valid is True
        assert connector.status == ConnectorStatus.CONNECTED
        assert connector.last_synced_at is not None

    # 2. Test Failed Provider Verification
    with patch("app.modules.connectors.service.resolve_provider") as mock_resolve:
        mock_provider = AsyncMock()
        mock_provider.test_connection.return_value = False
        mock_resolve.return_value = mock_provider

        is_valid_failed = await service.test_connection(connector.id)
        assert is_valid_failed is False
        assert connector.status == ConnectorStatus.NEEDS_REAUTH
        assert connector.last_error_message is not None


@pytest.mark.anyio
async def test_fetch_opportunities_orchestration(db_session: Session):
    service = ConnectorService(db_session)
    connector = service.create_connector(
        CreateConnectorCommand(
            name="GSC Striking Distance",
            connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
            target_identifier="https://orlume.site",
            refresh_token="tok_123",
        )
    )

    mocked_data = [
        {
            "query": "marketing ai tools",
            "page_url": "https://orlume.site/blog/marketing-ai",
            "impressions": 1200,
            "clicks": 45,
            "ctr": 0.037,
            "position": 5.4,
            "opportunity_type": "striking_distance",
            "score": 82.5,
        }
    ]

    with patch("app.modules.connectors.service.resolve_provider") as mock_resolve:
        mock_provider = AsyncMock()
        mock_provider.fetch_opportunities.return_value = mocked_data
        mock_resolve.return_value = mock_provider

        opportunities = await service.fetch_opportunities(
            connector_id=connector.id,
            min_impressions=500,
            limit=5,
        )

        assert len(opportunities) == 1
        assert opportunities[0].query == "marketing ai tools"
        assert opportunities[0].impressions == 1200
        assert opportunities[0].position == 5.4
        assert opportunities[0].score == 82.5

        db_session.refresh(connector)
        assert connector.last_synced_at is not None


@pytest.mark.anyio
async def test_fetch_opportunities_on_paused_connector_raises(db_session: Session):
    service = ConnectorService(db_session)
    connector = service.create_connector(
        CreateConnectorCommand(
            name="Paused Source",
            connector_type=ConnectorType.AHREFS,
            target_identifier="target.com",
            api_key="ahrefs_key",
        )
    )
    service.update_connector(UpdateConnectorCommand(connector_id=connector.id, is_active=False))

    with pytest.raises(InvalidConnectorConfigError):
        await service.fetch_opportunities(connector.id)
