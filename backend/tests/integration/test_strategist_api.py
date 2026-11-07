import pytest
from httpx import AsyncClient
from pydantic_ai.models.test import TestModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import marketing_agent
from app.common.enums import StrategistStatus
from app.modules.strategist.service import StrategistService


@pytest.mark.anyio
async def test_get_strategist_state_and_set_model_api(client: AsyncClient) -> None:
    res = await client.get("/api/v1/strategist/state")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "idle"
    assert data["autonomy_level"] == "staged_review"
    assert data["cycle_count"] == 0
    assert data["session_id"] is not None

    model_res = await client.post(
        "/api/v1/strategist/model",
        json={"model_id": "nvidia/nemotron-3-ultra-550b-a55b:free"},
    )
    assert model_res.status_code == 200
    assert model_res.json()["model_id"] == "nvidia/nemotron-3-ultra-550b-a55b:free"


@pytest.mark.anyio
async def test_toggle_pause_and_update_autonomy_api(client: AsyncClient) -> None:
    pause_res = await client.post("/api/v1/strategist/toggle-pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"

    resume_res = await client.post("/api/v1/strategist/toggle-pause")
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "idle"

    auto_res = await client.post(
        "/api/v1/strategist/autonomy",
        json={"autonomy_level": "full_auto"},
    )
    assert auto_res.status_code == 200
    assert auto_res.json()["autonomy_level"] == "full_auto"


@pytest.mark.anyio
async def test_force_run_cycle_delete_cycle_and_clear_context_api(
    client: AsyncClient,
) -> None:
    mock_model = TestModel(
        call_tools=["evaluate_marketing_performance", "sleep"],
        custom_output_text="Evaluated performance and queued morning campaign. Entering sleep.",
    )

    with marketing_agent.override(model=mock_model):
        run1 = await client.post("/api/v1/strategist/run-now")
        assert run1.status_code == 200
        assert run1.json()["cycle_count"] == 1

        run2 = await client.post("/api/v1/strategist/run-now")
        assert run2.status_code == 200
        data2 = run2.json()
        assert data2["cycle_count"] == 2
        session_id = data2["session_id"]

    msgs_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")
    assert msgs_res.status_code == 200
    messages = msgs_res.json()
    assert len(messages) == 4
    first_briefing_id = messages[1]["id"]

    # 1. Delete single cycle briefing
    del_cycle_res = await client.delete(f"/api/v1/strategist/cycles/{first_briefing_id}")
    assert del_cycle_res.status_code == 200
    assert del_cycle_res.json()["cycle_count"] == 1

    # 2. Clear entire context & cycle logs
    clear_res = await client.post("/api/v1/strategist/clear-context")
    assert clear_res.status_code == 200
    assert clear_res.json()["cycle_count"] == 0

    msgs_after_clear = (await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")).json()
    assert len(msgs_after_clear) == 0


@pytest.mark.anyio
async def test_force_run_cycle_when_already_running_returns_409(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    service = StrategistService(db_session)
    state = await service.get_or_create_state()
    state.status = StrategistStatus.RUNNING
    await db_session.commit()

    res = await client.post("/api/v1/strategist/run-now")
    assert res.status_code == 409
    assert res.json()["error"] == "CONFLICT"


@pytest.mark.anyio
async def test_human_blocker_and_reply_api_flow(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    service = StrategistService(db_session)
    await service.record_human_blocker(
        urgency="high",
        question="Should we target SaaS founders or indie hackers next?",
    )

    state_res = await client.get("/api/v1/strategist/state")
    assert state_res.json()["status"] == "waiting_for_human"

    mock_model = TestModel(
        call_tools=["sleep"],
        custom_output_text="Received guidance: targeting SaaS founders. Sleeping for 60m.",
    )

    with marketing_agent.override(model=mock_model):
        reply_res = await client.post(
            "/api/v1/strategist/reply",
            json={"reply": "Focus on SaaS founders first."},
        )
        assert reply_res.status_code == 200
        data = reply_res.json()
        assert data["status"] == "sleeping"
        assert data["pending_question"] is None


@pytest.mark.anyio
async def test_reply_when_not_waiting_returns_409(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/strategist/reply",
        json={"reply": "Unprompted advice"},
    )
    assert res.status_code == 409
    assert res.json()["error"] == "CONFLICT"
