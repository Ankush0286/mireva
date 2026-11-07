from uuid import uuid4

import pytest
from httpx import AsyncClient

# =============================================================================
# Chat Session API Integration Tests
# =============================================================================


@pytest.mark.anyio
async def test_chat_session_api_lifecycle(client: AsyncClient):
    # 1. Create chat session
    create_res = await client.post(
        "/api/v1/copilot/sessions",
        json={
            "title": "Campaign Growth Strategy",
            "system_prompt_override": "You are an aggressive B2B growth marketer.",
        },
    )
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["title"] == "Campaign Growth Strategy"
    assert data["is_archived"] is False
    session_id = data["id"]

    # 2. Get session by ID
    get_res = await client.get(f"/api/v1/copilot/sessions/{session_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == session_id
    assert get_res.json()["messages"] == []

    # 3. List sessions
    list_res = await client.get("/api/v1/copilot/sessions")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 4. Patch session
    patch_res = await client.patch(
        f"/api/v1/copilot/sessions/{session_id}",
        json={"title": "Updated Strategy", "is_archived": True},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Updated Strategy"
    assert patch_res.json()["is_archived"] is True

    # 5. Delete session
    del_res = await client.delete(f"/api/v1/copilot/sessions/{session_id}")
    assert del_res.status_code == 204

    # 6. Verify 404
    assert (await client.get(f"/api/v1/copilot/sessions/{session_id}")).status_code == 404


@pytest.mark.anyio
async def test_create_session_empty_title_returns_422(client: AsyncClient):
    res = await client.post(
        "/api/v1/copilot/sessions",
        json={"title": "     "},  # Pure whitespace
    )
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"


# =============================================================================
# Chat Messages & Tool Traces API Integration Tests
# =============================================================================


@pytest.mark.anyio
async def test_chat_messages_and_detail_hydration_api(client: AsyncClient):
    # 1. Create session
    session_res = await client.post(
        "/api/v1/copilot/sessions",
        json={"title": "Messaging Test"},
    )
    session_id = session_res.json()["id"]

    # 2. Append user message
    msg_res = await client.post(
        f"/api/v1/copilot/sessions/{session_id}/messages",
        json={
            "role": "user",
            "content": "Generate 3 cold outreach hooks for tech founders.",
        },
    )
    assert msg_res.status_code == 201
    msg_data = msg_res.json()
    assert msg_data["role"] == "user"
    assert msg_data["content"] == "Generate 3 cold outreach hooks for tech founders."

    # 3. List messages via endpoint
    list_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 4. Get session detail endpoint (verifies messages array is hydrated)
    detail_res = await client.get(f"/api/v1/copilot/sessions/{session_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert len(detail_data["messages"]) == 1
    assert detail_data["messages"][0]["id"] == msg_data["id"]


@pytest.mark.anyio
async def test_list_tool_executions_api(client: AsyncClient):
    session_res = await client.post(
        "/api/v1/copilot/sessions",
        json={"title": "Tool API Test"},
    )
    session_id = session_res.json()["id"]

    # Endpoint query
    tools_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/tools")
    assert tools_res.status_code == 200
    assert tools_res.json() == []


@pytest.mark.anyio
async def test_get_nonexistent_session_returns_404(client: AsyncClient):
    fake_uuid = str(uuid4())
    res = await client.get(f"/api/v1/copilot/sessions/{fake_uuid}")
    assert res.status_code == 404
    assert res.json()["error"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_add_message_invalid_payload_returns_422(client: AsyncClient):
    fake_uuid = str(uuid4())
    # Missing required 'content' field
    res = await client.post(
        f"/api/v1/copilot/sessions/{fake_uuid}/messages",
        json={"role": "user"},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"



@pytest.mark.anyio
async def test_delete_messages_from_api(client: AsyncClient) -> None:
    session_res = await client.post(
        "/api/v1/copilot/sessions",
        json={"title": "Truncate API Test"},
    )
    session_id = session_res.json()["id"]

    m1_res = await client.post(
        f"/api/v1/copilot/sessions/{session_id}/messages",
        json={"role": "user", "content": "First prompt"},
    )
    m2_res = await client.post(
        f"/api/v1/copilot/sessions/{session_id}/messages",
        json={"role": "assistant", "content": "First reply"},
    )
    m2_id = m2_res.json()["id"]

    del_res = await client.delete(
        f"/api/v1/copilot/sessions/{session_id}/messages/{m2_id}"
    )
    assert del_res.status_code == 204

    list_res = await client.get(f"/api/v1/copilot/sessions/{session_id}/messages")
    remaining = list_res.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == m1_res.json()["id"]
