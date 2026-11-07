from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from pydantic_ai.models.test import TestModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import marketing_agent
from app.automation.workers.strategist_worker import run_strategist_heartbeat
from app.common.enums import StrategistStatus
from app.modules.strategist.service import StrategistService


@pytest.mark.anyio
async def test_get_strategist_state_api(client: AsyncClient) -> None:
    res = await client.get("/api/v1/strategist/state")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "idle"
    assert data["autonomy_level"] == "staged_review"
    assert data["cycle_count"] == 0
    assert data["session_id"] is not None


@pytest.mark.anyio
async def test_toggle_pause_and_update_autonomy_api(client: AsyncClient) -> None:
    # 1. Pause
    pause_res = await client.post("/api/v1/strategist/toggle-pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"

    # 2. Resume
    resume_res = await client.post("/api/v1/strategist/toggle-pause")
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "idle"

    # 3. Update autonomy level
    auto_res = await client.post(
        "/api/v1/strategist/autonomy",
        json={"autonomy_level": "full_auto"},
    )
    assert auto_res.status_code == 200
    assert auto_res.json()["autonomy_level"] == "full_auto"


@pytest.mark.anyio
async def test_force_run_cycle_api_with_test_model(client: AsyncClient) -> None:
    mock_model = TestModel(
        call_tools=["evaluate_marketing_performance", "sleep"],
        custom_output_text="Evaluated performance and queued morning campaign. Entering sleep.",
    )

    with marketing_agent.override(model=mock_model):
        run_res = await client.post("/api/v1/strategist/run-now")
        assert run_res.status_code == 200
        data = run_res.json()

        assert data["cycle_count"] == 1
        assert data["status"] == "sleeping"
        assert data["next_cycle_at"] is not None
        session_id = data["session_id"]

    # Verify monologue messages and tool traces were persisted in the dedicated ChatSession
    msgs_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")
    assert msgs_res.status_code == 200
    messages = msgs_res.json()
    assert len(messages) == 2
    assert messages[1]["role"] == "assistant"
    assert "Entering sleep" in messages[1]["content"]
    assert "usage" in messages[1]["extra_metadata"]

    tools_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/tools")
    assert tools_res.status_code == 200
    tool_names = [t["tool_name"] for t in tools_res.json()]
    assert "evaluate_marketing_performance" in tool_names
    assert "sleep" in tool_names


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

    # Verify state via API
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


@pytest.mark.anyio
async def test_strategist_heartbeat_worker_lifecycle(db_session: AsyncSession) -> None:
    service = StrategistService(db_session)
    state = await service.record_sleep(duration_minutes=60, rationale="Future wake")

    # 1. Not due yet -> worker skips (returns 0)
    ran_count = await run_strategist_heartbeat(db=db_session)
    assert ran_count == 0

    # 2. Age next_cycle_at into the past -> worker wakes up and executes cycle!
    state.next_cycle_at = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.commit()

    mock_model = TestModel(
        call_tools=["sleep"],
        custom_output_text="Heartbeat cycle completed.",
    )
    with marketing_agent.override(model=mock_model):
        ran_due = await run_strategist_heartbeat(db=db_session)
        assert ran_due == 1

    await db_session.refresh(state)
    assert state.cycle_count == 1
    assert state.status == StrategistStatus.SLEEPING


@pytest.mark.anyio
async def test_copilot_delete_messages_from_endpoint(client: AsyncClient) -> None:
    # 1. Create session
    sess_res = await client.post("/api/v1/copilot/sessions", json={"title": "Truncate API Test"})
    session_id = sess_res.json()["id"]

    # 2. Add two messages
    m1_res = await client.post(
        f"/api/v1/copilot/sessions/{session_id}/messages",
        json={"role": "user", "content": "First prompt"},
    )
    m2_res = await client.post(
        f"/api/v1/copilot/sessions/{session_id}/messages",
        json={"role": "assistant", "content": "First reply"},
    )
    m2_id = m2_res.json()["id"]

    # 3. Delete from m2 onwards
    del_res = await client.delete(f"/api/v1/copilot/sessions/{session_id}/messages/{m2_id}")
    assert del_res.status_code == 204

    # 4. Verify only m1 remains
    list_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")
    remaining = list_res.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == m1_res.json()["id"]
