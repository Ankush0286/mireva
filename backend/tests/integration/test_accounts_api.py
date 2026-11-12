import pytest
from httpx import AsyncClient


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
