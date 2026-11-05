from uuid import uuid4

from fastapi.testclient import TestClient


def test_get_primary_brand_kit_api(client: TestClient):
    # GET /api/v1/brand/primary returns or auto-creates blank primary brand kit
    res = client.get("/api/v1/brand/primary")
    assert res.status_code == 200
    data = res.json()

    assert data["name"] == ""
    assert data["is_primary"] is True
    assert data["tone_traits"] == []
    assert data["banned_words"] == []
    assert data["target_personas"] == []
    assert "id" in data


def test_create_and_patch_brand_kit_api(client: TestClient):
    # 1. POST Create new secondary brand kit
    create_res = client.post(
        "/api/v1/brand/",
        json={
            "name": "Acme SaaS",
            "tagline": "Next-gen analytics",
            "website_url": "https://acme.io",
            "industry": "Analytics",
            "is_primary": False,
            "tone_traits": ["professional", "data-driven"],
            "banned_words": ["revolutionary"],
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    kit_id = created_data["id"]
    assert created_data["name"] == "Acme SaaS"
    assert created_data["is_primary"] is False

    # 2. PATCH update the brand kit
    patch_res = client.patch(
        f"/api/v1/brand/{kit_id}",
        json={
            "tagline": "Refined Analytics Engine",
            "pricing_summary": "$19 / seat / mo",
            "tone_traits": ["concise", "witty"],
        },
    )
    assert patch_res.status_code == 200
    updated_data = patch_res.json()
    assert updated_data["tagline"] == "Refined Analytics Engine"
    assert updated_data["pricing_summary"] == "$19 / seat / mo"
    assert "witty" in updated_data["tone_traits"]


def test_patch_nonexistent_brand_kit_returns_404(client: TestClient):
    fake_uuid = str(uuid4())
    res = client.patch(
        f"/api/v1/brand/{fake_uuid}",
        json={"name": "Ghost Brand"},
    )
    assert res.status_code == 404
    assert res.json()["error"] == "NOT_FOUND"


def test_create_brand_kit_name_exceeds_max_length_returns_422(client: TestClient):
    # Name exceeding max_length=150
    res = client.post(
        "/api/v1/brand/",
        json={"name": "x" * 151},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"
