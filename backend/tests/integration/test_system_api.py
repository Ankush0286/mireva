import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_get_system_diagnostics_api(client: AsyncClient):
    res = await client.get("/api/v1/system/diagnostics")
    assert res.status_code == 200
    data = res.json()

    assert data["overall_status"] in ("healthy", "warning")
    assert len(data["subsystems"]) >= 4
    assert "recipe_matrix" in data
    assert len(data["recipe_matrix"]) == 9  # 3 platforms x 3 write actions
    assert "entity_counts" in data


@pytest.mark.anyio
async def test_seed_default_recipes_idempotent_api(client: AsyncClient):
    # 1st call seeds the 6 default templates (3 IG + 3 Twitter write actions)
    res1 = await client.post("/api/v1/system/seed-recipes")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["seeded_count"] == 6
    assert data1["total_recipes"] >= 6

    # 2nd call is idempotent (0 newly seeded, no duplicates)
    res2 = await client.post("/api/v1/system/seed-recipes")
    assert res2.status_code == 200
    assert res2.json()["seeded_count"] == 0

    # Diagnostics matrix now reflects custom_ready for all seeded slots
    diag_res = await client.get("/api/v1/system/diagnostics")
    matrix = diag_res.json()["recipe_matrix"]
    custom_ready_slots = [slot for slot in matrix if slot["status"] == "custom_ready"]
    assert len(custom_ready_slots) >= 6


@pytest.mark.anyio
async def test_trigger_worker_manually_api(client: AsyncClient):
    res = await client.post("/api/v1/system/workers/post_dispatcher/run")
    assert res.status_code == 200
    data = res.json()
    assert data["worker"] == "post_dispatcher"
    assert data["status"] == "completed"

    # Unknown worker returns 400 Bad Request
    bad_res = await client.post("/api/v1/system/workers/invalid_worker/run")
    assert bad_res.status_code == 400


@pytest.mark.anyio
async def test_sync_replica_api(client: AsyncClient):
    """Verifies the manual replica sync endpoint completes successfully."""
    res = await client.post("/api/v1/system/sync-replica")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "message" in data
