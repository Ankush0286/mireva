from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.modules.recipes.service import RecipeService


def test_recipe_api_lifecycle(client: TestClient):
    payload = {
        "name": "Instagram Story Post",
        "platform": "instagram",
        "description": "Story publish workflow",
        "steps": [
            {"type": "click", "description": "Click Story Icon", "selectors": ["[aria-label='Story']"]}
        ],
        "is_default": True,
    }

    # 1. POST Create
    create_res = client.post("/api/v1/recipes/", json=payload)
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["name"] == "Instagram Story Post"
    assert data["platform"] == "instagram"
    assert data["is_default"] is True
    recipe_id = data["id"]

    # 2. GET by ID
    get_res = client.get(f"/api/v1/recipes/{recipe_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == recipe_id

    # 3. GET default recipe endpoint
    default_res = client.get("/api/v1/recipes/default?platform=instagram")
    assert default_res.status_code == 200
    assert default_res.json()["id"] == recipe_id

    # 4. PATCH update
    patch_res = client.patch(
        f"/api/v1/recipes/{recipe_id}",
        json={"name": "Renamed Story Flow", "is_active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Renamed Story Flow"
    assert patch_res.json()["is_active"] is False

    # 5. DELETE
    del_res = client.delete(f"/api/v1/recipes/{recipe_id}")
    assert del_res.status_code == 204

    # 6. Verify 404
    assert client.get(f"/api/v1/recipes/{recipe_id}").status_code == 404


def test_list_recipes_with_query_filters(client: TestClient):
    client.post(
        "/api/v1/recipes/",
        json={"name": "Twitter Tweet", "platform": "twitter"},
    )
    client.post(
        "/api/v1/recipes/",
        json={"name": "Twitter DM", "platform": "twitter"},
    )
    client.post(
        "/api/v1/recipes/",
        json={"name": "IG Reel", "platform": "instagram"},
    )

    # Filter by platform=twitter
    tw_res = client.get("/api/v1/recipes/?platform=twitter")
    assert tw_res.status_code == 200
    assert len(tw_res.json()) == 2


def test_create_duplicate_recipe_returns_409(client: TestClient):
    payload = {"name": "Unique Recipe", "platform": "instagram"}
    res1 = client.post("/api/v1/recipes/", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/recipes/", json=payload)
    assert res2.status_code == 409
    assert res2.json()["error"] == "CONFLICT"


def test_get_nonexistent_recipe_returns_404(client: TestClient):
    fake_uuid = str(uuid4())
    res = client.get(f"/api/v1/recipes/{fake_uuid}")
    assert res.status_code == 404
    assert res.json()["error"] == "NOT_FOUND"


def test_create_recipe_empty_name_returns_422(client: TestClient):
    res = client.post(
        "/api/v1/recipes/",
        json={"name": "   ", "platform": "instagram"},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"


def test_recipe_recorder_websocket_endpoint_handshake(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """
    Verifies that the /recipes/record/ws endpoint accepts WebSocket upgrades
    and delegates cleanly to RecipeService.
    """
    mock_stream = AsyncMock()
    monkeypatch.setattr(RecipeService, "run_recipe_recorder_stream", mock_stream)

    with client.websocket_connect("/api/v1/recipes/record/ws?platform=instagram"):
        pass

    mock_stream.assert_called_once()
    args, kwargs = mock_stream.call_args
    assert kwargs.get("platform") == "instagram" or args[0] == "instagram"
