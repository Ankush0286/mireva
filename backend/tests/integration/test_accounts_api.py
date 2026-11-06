from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

from app.modules.accounts.service import AccountService


@pytest.mark.anyio
async def test_create_and_get_account_flow(client: AsyncClient):
    payload = {
        "platform": "twitter",
        "handle": "integration_bot",
        "display_name": "Integration Bot",
        "daily_post_limit": 5,
        "access_token": "token_to_encrypt",
    }

    # 1. POST create
    response = await client.post("/api/v1/accounts/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["handle"] == "integration_bot"
    assert data["daily_post_limit"] == 5
    assert "id" in data
    account_id = data["id"]

    # Verify sensitive token is excluded from response
    assert "access_token" not in data
    assert "encrypted_access_token" not in data

    # 2. GET by ID
    get_response = await client.get(f"/api/v1/accounts/{account_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == account_id


@pytest.mark.anyio
async def test_list_and_filter_accounts_api(client: AsyncClient):
    await client.post(
        "/api/v1/accounts/",
        json={"platform": "twitter", "handle": "list_bot_1"},
    )
    res2 = await client.post(
        "/api/v1/accounts/",
        json={"platform": "instagram", "handle": "list_bot_2"},
    )
    acc2_id = res2.json()["id"]

    # Deactivate second account
    await client.patch(f"/api/v1/accounts/{acc2_id}", json={"is_active": False})

    # List all
    all_res = await client.get("/api/v1/accounts/")
    assert all_res.status_code == 200
    assert len(all_res.json()) == 2

    # List active only
    active_res = await client.get("/api/v1/accounts/?active_only=true")
    assert active_res.status_code == 200
    assert len(active_res.json()) == 1
    assert active_res.json()[0]["handle"] == "list_bot_1"


@pytest.mark.anyio
async def test_patch_account_api(client: AsyncClient):
    res = await client.post(
        "/api/v1/accounts/",
        json={"platform": "twitter", "handle": "patch_bot", "daily_post_limit": 5},
    )
    account_id = res.json()["id"]

    patch_res = await client.patch(
        f"/api/v1/accounts/{account_id}",
        json={"display_name": "Updated Name", "daily_post_limit": 15},
    )
    assert patch_res.status_code == 200
    updated_data = patch_res.json()
    assert updated_data["display_name"] == "Updated Name"
    assert updated_data["daily_post_limit"] == 15


@pytest.mark.anyio
async def test_delete_account_api(client: AsyncClient):
    res = await client.post(
        "/api/v1/accounts/",
        json={"platform": "twitter", "handle": "delete_bot"},
    )
    account_id = res.json()["id"]

    # Delete returns 204
    del_res = await client.delete(f"/api/v1/accounts/{account_id}")
    assert del_res.status_code == 204

    # Subsequent GET returns 404
    get_res = await client.get(f"/api/v1/accounts/{account_id}")
    assert get_res.status_code == 404


@pytest.mark.anyio
async def test_create_duplicate_account_returns_409(client: AsyncClient):
    payload = {
        "platform": "instagram",
        "handle": "brand_official",
    }
    res1 = await client.post("/api/v1/accounts/", json=payload)
    assert res1.status_code == 201

    res2 = await client.post("/api/v1/accounts/", json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"] == "CONFLICT"


@pytest.mark.anyio
async def test_get_nonexistent_account_returns_404(client: AsyncClient):
    random_uuid = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/accounts/{random_uuid}")
    assert response.status_code == 404
    assert response.json()["error"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_invalid_payload_returns_422(client: AsyncClient):
    payload = {
        "platform": "twitter",
        "handle": "invalid handle with spaces!",
    }
    response = await client.post("/api/v1/accounts/", json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_account_session_websocket_endpoint_handshake(
    client: AsyncClient, 
    ws_client: TestClient, 
    monkeypatch: pytest.MonkeyPatch
):
    # 1. Create account via API
    res = await client.post(
        "/api/v1/accounts/",
        json={"platform": "instagram", "handle": "ws_test_account"},
    )
    assert res.status_code == 201
    account_id = res.json()["id"]

    # 2. Mock run_session_authentication_stream to send a dummy message
    mock_stream = AsyncMock()

    async def fake_stream(acc_id, ws):
        # Send a dummy message to unlock ws.receive_json() in the test
        await ws.send_json({"status": "mocked"})

    mock_stream.side_effect = fake_stream
    monkeypatch.setattr(AccountService, "run_session_authentication_stream", mock_stream)

    # 3. Connect and WAIT for the message sent by fake_stream
    with ws_client.websocket_connect(f"/api/v1/accounts/{account_id}/session/ws") as ws:
        data = ws.receive_json()
        assert data["status"] == "mocked"

    # 4. Verify service method was invoked with the correct account ID
    mock_stream.assert_called_once()
    args, _ = mock_stream.call_args
    assert str(args[0]) == str(account_id)
