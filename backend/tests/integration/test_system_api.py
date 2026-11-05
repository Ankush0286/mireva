from fastapi.testclient import TestClient


def test_get_system_diagnostics_api(client: TestClient):
    res = client.get("/api/v1/system/diagnostics")
    assert res.status_code == 200
    data = res.json()

    assert data["overall_status"] in ("healthy", "warning")
    assert len(data["subsystems"]) >= 4
    assert "recipe_matrix" in data
    assert len(data["recipe_matrix"]) == 12  # 3 platforms x 4 core actions
    assert "entity_counts" in data


def test_seed_default_recipes_idempotent_api(client: TestClient):
    # 1st call seeds the 8 default templates (4 IG + 4 Twitter)
    res1 = client.post("/api/v1/system/seed-recipes")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["seeded_count"] == 8
    assert data1["total_recipes"] >= 8

    # 2nd call is idempotent (0 newly seeded, no duplicates)
    res2 = client.post("/api/v1/system/seed-recipes")
    assert res2.status_code == 200
    assert res2.json()["seeded_count"] == 0

    # Diagnostics matrix now reflects custom_ready for all seeded slots
    diag_res = client.get("/api/v1/system/diagnostics")
    matrix = diag_res.json()["recipe_matrix"]
    custom_ready_slots = [slot for slot in matrix if slot["status"] == "custom_ready"]
    assert len(custom_ready_slots) >= 8


def test_trigger_worker_manually_api(client: TestClient):
    res = client.post("/api/v1/system/workers/post_dispatcher/run")
    assert res.status_code == 200
    data = res.json()
    assert data["worker"] == "post_dispatcher"
    assert data["status"] == "completed"

    # Unknown worker returns 400 Bad Request
    bad_res = client.post("/api/v1/system/workers/invalid_worker/run")
    assert bad_res.status_code == 400
