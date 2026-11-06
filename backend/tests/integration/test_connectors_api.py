from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.modules.connectors.schemas import MetricOpportunityItem
from app.modules.connectors.service import ConnectorService


@pytest.mark.anyio
async def test_connector_api_lifecycle(client: AsyncClient):
    payload = {
        "name": "Integration Search Console",
        "connector_type": "google_search_console",
        "target_identifier": "https://orlume.site",
        "sync_frequency_minutes": 180,
        "refresh_token": "rt_secret_token_to_encrypt",
        "client_id": "google_client_id_xyz",
        "client_secret": "google_client_secret_xyz",
    }

    # 1. POST Create
    create_res = await client.post("/api/v1/connectors/", json=payload)
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["name"] == "Integration Search Console"
    assert data["connector_type"] == "google_search_console"
    assert data["target_identifier"] == "https://orlume.site"
    assert data["is_active"] is True
    connector_id = data["id"]

    # Verify sensitive tokens are strictly excluded from response JSON
    assert "refresh_token" not in data
    assert "encrypted_refresh_token" not in data
    assert "client_secret" not in data
    assert "encrypted_client_secret" not in data

    # 2. GET by ID
    get_res = await client.get(f"/api/v1/connectors/{connector_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == connector_id

    # 3. PATCH Update
    patch_res = await client.patch(
        f"/api/v1/connectors/{connector_id}",
        json={
            "name": "Renamed Search Console",
            "sync_frequency_minutes": 720,
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Renamed Search Console"
    assert patch_res.json()["sync_frequency_minutes"] == 720

    # 4. DELETE
    del_res = await client.delete(f"/api/v1/connectors/{connector_id}")
    assert del_res.status_code == 204

    # 5. Subsequent GET returns 404
    assert (await client.get(f"/api/v1/connectors/{connector_id}")).status_code == 404


@pytest.mark.anyio
async def test_list_and_filter_connectors_api(client: AsyncClient):
    # Seed connector 1
    res1 = await client.post(
        "/api/v1/connectors/",
        json={
            "name": "GSC Source",
            "connector_type": "google_search_console",
            "target_identifier": "https://mybrand.com",
            "refresh_token": "token1",
        },
    )
    assert res1.status_code == 201

    # Seed connector 2
    res2 = await client.post(
        "/api/v1/connectors/",
        json={
            "name": "Ahrefs Source",
            "connector_type": "ahrefs",
            "target_identifier": "competitor.com",
            "api_key": "key1",
        },
    )
    assert res2.status_code == 201
    c2_id = res2.json()["id"]

    # Pause second connector
    await client.patch(f"/api/v1/connectors/{c2_id}", json={"is_active": False})

    # List all
    all_res = await client.get("/api/v1/connectors/")
    assert all_res.status_code == 200
    assert len(all_res.json()) >= 2

    # Filter active only
    active_res = await client.get("/api/v1/connectors/?active_only=true")
    assert active_res.status_code == 200
    active_items = active_res.json()
    assert all(item["is_active"] is True for item in active_items)

    # Filter by connector_type
    gsc_res = await client.get("/api/v1/connectors/?connector_type=google_search_console")
    assert gsc_res.status_code == 200
    gsc_items = gsc_res.json()
    assert all(item["connector_type"] == "google_search_console" for item in gsc_items)


@pytest.mark.anyio
async def test_create_duplicate_connector_returns_409(client: AsyncClient):
    payload = {
        "name": "Unique GSC",
        "connector_type": "google_search_console",
        "target_identifier": "https://unique-target.com",
        "refresh_token": "rt_123",
    }

    res1 = await client.post("/api/v1/connectors/", json=payload)
    assert res1.status_code == 201

    # Second attempt with same provider and target
    res2 = await client.post("/api/v1/connectors/", json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"] == "CONFLICT"


@pytest.mark.anyio
async def test_create_connector_without_credentials_returns_422(client: AsyncClient):
    payload = {
        "name": "No Auth Connector",
        "connector_type": "ahrefs",
        "target_identifier": "target.com",
        # Missing api_key and refresh_token
    }

    res = await client.post("/api/v1/connectors/", json=payload)
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_get_nonexistent_connector_returns_404(client: AsyncClient):
    fake_uuid = str(uuid4())
    res = await client.get(f"/api/v1/connectors/{fake_uuid}")
    assert res.status_code == 404
    assert res.json()["error"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_test_connector_endpoint(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    # 1. Register connector
    create_res = await client.post(
        "/api/v1/connectors/",
        json={
            "name": "Health Test GSC",
            "connector_type": "google_search_console",
            "target_identifier": "https://test-health.com",
            "refresh_token": "valid_token",
        },
    )
    assert create_res.status_code == 201
    connector_id = create_res.json()["id"]

    # 2. Mock service test_connection to avoid external network calls
    mock_test = AsyncMock(return_value=True)
    monkeypatch.setattr(ConnectorService, "test_connection", mock_test)

    # 3. Post to test endpoint
    test_res = await client.post(f"/api/v1/connectors/{connector_id}/test")
    assert test_res.status_code == 200
    data = test_res.json()
    assert data["status"] == "connected"
    assert data["verified"] is True


@pytest.mark.anyio
async def test_get_opportunities_endpoint(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    # 1. Register connector
    create_res = await client.post(
        "/api/v1/connectors/",
        json={
            "name": "Opportunities Source",
            "connector_type": "google_search_console",
            "target_identifier": "https://test-opps.com",
            "refresh_token": "valid_token",
        },
    )
    assert create_res.status_code == 201
    connector_id = create_res.json()["id"]

    mock_opps = [
        MetricOpportunityItem(
            query="best growth ai",
            page_url="https://test-opps.com/ai",
            impressions=2500,
            clicks=110,
            ctr=0.044,
            position=4.8,
            opportunity_type="striking_distance",
            score=88.0,
        )
    ]

    mock_fetch = AsyncMock(return_value=mock_opps)
    monkeypatch.setattr(ConnectorService, "fetch_opportunities", mock_fetch)

    # 2. Query opportunities endpoint
    opps_res = await client.get(
        f"/api/v1/connectors/{connector_id}/opportunities?min_impressions=1000&limit=5"
    )
    assert opps_res.status_code == 200
    data = opps_res.json()
    assert len(data) == 1
    assert data[0]["query"] == "best growth ai"
    assert data[0]["impressions"] == 2500
    assert data[0]["score"] == 88.0
