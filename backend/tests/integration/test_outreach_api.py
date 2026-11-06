from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


async def _create_account_via_api(client: AsyncClient, handle: str = "api_outreach_sender") -> str:
    """Helper to create a connected account via API."""
    res = await client.post(
        "/api/v1/accounts/",
        json={"platform": "twitter", "handle": handle},
    )
    assert res.status_code == 201
    return res.json()["id"]


# =============================================================================
# Lead Directory API Integration Tests
# =============================================================================


@pytest.mark.anyio
async def test_lead_api_lifecycle(client: AsyncClient):
    # 1. Create lead (verifying @ is cleanly stripped)
    create_res = await client.post(
        "/api/v1/outreach/leads",
        json={
            "platform": "twitter",
            "handle": "@influencer_mark",
            "display_name": "Influencer Mark",
            "bio": "Marketing director at SaaS Co.",
            "follower_count": 45000,
            "tier": "micro",
            "tags": ["b2b", "marketing"],
        },
    )
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["handle"] == "influencer_mark"  # Stripped @
    assert data["stage"] == "discovered"
    lead_id = data["id"]

    # 2. Get lead by ID
    get_res = await client.get(f"/api/v1/outreach/leads/{lead_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == lead_id

    # 3. List leads with filter
    list_res = await client.get("/api/v1/outreach/leads?tier=micro&stage=discovered")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 4. Patch lead
    patch_res = await client.patch(
        f"/api/v1/outreach/leads/{lead_id}",
        json={"stage": "qualified", "display_name": "Mark (Qualified)"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["stage"] == "qualified"
    assert patch_res.json()["display_name"] == "Mark (Qualified)"

    # 5. Delete lead
    del_res = await client.delete(f"/api/v1/outreach/leads/{lead_id}")
    assert del_res.status_code == 204

    # 6. Verify 404
    assert (await client.get(f"/api/v1/outreach/leads/{lead_id}")).status_code == 404


@pytest.mark.anyio
async def test_create_duplicate_lead_returns_409(client: AsyncClient):
    payload = {"platform": "twitter", "handle": "unique_influencer"}
    res1 = await client.post("/api/v1/outreach/leads", json=payload)
    assert res1.status_code == 201

    # Duplicate attempt with leading @
    res2 = await client.post("/api/v1/outreach/leads", json={"platform": "twitter", "handle": "@unique_influencer"})
    assert res2.status_code == 409
    assert res2.json()["error"] == "CONFLICT"


# =============================================================================
# Outreach Campaigns API Integration Tests
# =============================================================================


@pytest.mark.anyio
async def test_outreach_campaign_api_lifecycle(client: AsyncClient):
    account_id = await _create_account_via_api(client, "campaign_sender")

    # 1. Create campaign
    create_res = await client.post(
        "/api/v1/outreach/campaigns",
        json={
            "name": "Creator Partnerships Q4",
            "account_id": account_id,
            "description": "Cold DM outreach to top tech creators",
            "template": "Hey @{handle}, love your insights!",
        },
    )
    assert create_res.status_code == 201
    camp_data = create_res.json()
    campaign_id = camp_data["id"]
    assert camp_data["name"] == "Creator Partnerships Q4"
    assert camp_data["is_active"] is True

    # 2. Get campaign
    get_res = await client.get(f"/api/v1/outreach/campaigns/{campaign_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == campaign_id

    # 3. Patch campaign
    patch_res = await client.patch(
        f"/api/v1/outreach/campaigns/{campaign_id}",
        json={"name": "Renamed Campaign", "is_active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Renamed Campaign"
    assert patch_res.json()["is_active"] is False

    # 4. Delete campaign
    del_res = await client.delete(f"/api/v1/outreach/campaigns/{campaign_id}")
    assert del_res.status_code == 204

    # 5. Verify 404
    assert (await client.get(f"/api/v1/outreach/campaigns/{campaign_id}")).status_code == 404


# =============================================================================
# Staged Messages & Human Review Gates API Integration Tests
# =============================================================================


@pytest.mark.anyio
async def test_stage_and_review_message_flow(client: AsyncClient):
    account_id = await _create_account_via_api(client, "sender_pro")

    lead_res = await client.post(
        "/api/v1/outreach/leads",
        json={"platform": "twitter", "handle": "staged_prospect"},
    )
    lead_id = lead_res.json()["id"]

    # 1. Stage message behind human approval gate
    stage_res = await client.post(
        "/api/v1/outreach/messages/stage",
        json={
            "lead_id": lead_id,
            "account_id": account_id,
            "content": "Hey, loved your latest post on growth engineering!",
            "channel": "dm",
        },
    )
    assert stage_res.status_code == 201
    msg_data = stage_res.json()
    message_id = msg_data["id"]
    assert msg_data["status"] == "staged"

    # 2. List messages
    list_res = await client.get(f"/api/v1/outreach/messages?lead_id={lead_id}&status=staged")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Review message (approve with copy refinement)
    review_res = await client.post(
        f"/api/v1/outreach/messages/{message_id}/review",
        json={
            "status": "approved",
            "edited_content": "Hey, loved your latest post on growth engineering! Have a quick question.",
        },
    )
    assert review_res.status_code == 200
    reviewed_data = review_res.json()
    assert reviewed_data["status"] == "approved"
    assert reviewed_data["content"] == "Hey, loved your latest post on growth engineering! Have a quick question."
    assert reviewed_data["reviewed_at"] is not None


@pytest.mark.anyio
async def test_stage_message_uncontactable_lead_returns_409(client: AsyncClient):
    account_id = await _create_account_via_api(client, "sender_bot")

    lead_res = await client.post(
        "/api/v1/outreach/leads",
        json={"platform": "twitter", "handle": "optout_lead", "stage": "do_not_contact"},
    )
    lead_id = lead_res.json()["id"]

    # Staging message for an uncontactable lead must return 409 Conflict
    stage_res = await client.post(
        "/api/v1/outreach/messages/stage",
        json={
            "lead_id": lead_id,
            "account_id": account_id,
            "content": "This pitch must be rejected.",
        },
    )
    assert stage_res.status_code == 409
    assert stage_res.json()["error"] == "CONFLICT"


@pytest.mark.anyio
async def test_review_message_invalid_status_returns_422(client: AsyncClient):
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    res = await client.post(
        f"/api/v1/outreach/messages/{fake_uuid}/review",
        json={"status": "invalid_status"},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_scout_creators_api_endpoint(client: AsyncClient):
    account_id = await _create_account_via_api(client, "scout_tester_bot")

    mock_scout_json = (
        '[\n'
        '  {"handle": "indie_founder_1", "display_name": "Indie Founder", "bio": "Building SaaS", "follower_count": 18000, "reason": "SaaS founder"},\n'
        '  {"handle": "devtool_creator", "display_name": "Dev Creator", "bio": "Dev tools reviewer", "follower_count": 32000, "reason": "High engagement"}\n'
        ']'
    )

    with patch("app.modules.outreach.router.scout_influencer_leads", new_callable=AsyncMock) as mock_scout:
        mock_scout.return_value = mock_scout_json

        res = await client.post(
            "/api/v1/outreach/scout",
            json={
                "account_id": account_id,
                "niche_or_query": "ai website builder",
                "max_leads": 5,
                "auto_import": True,
            },
        )
        assert res.status_code == 200
        data = res.json()

        assert data["niche"] == "ai website builder"
        assert data["discovered_count"] == 2
        assert data["imported_count"] == 2
        assert len(data["leads"]) == 2

    # Verify leads were automatically persisted in CRM
    leads_res = await client.get("/api/v1/outreach/leads")
    assert leads_res.status_code == 200
    crm_handles = [item["handle"] for item in leads_res.json()]
    assert "indie_founder_1" in crm_handles
    assert "devtool_creator" in crm_handles


@pytest.mark.anyio
async def test_sweep_inbox_api_endpoint(client: AsyncClient):
    account_id = await _create_account_via_api(client, "inbox_checker_bot")

    mock_summary = "Checked inbox: Found 1 unread reply from @billgates saying 'Sounds interesting, tell me more.'"

    with patch("app.modules.outreach.router.read_and_summarize_inbox", new_callable=AsyncMock) as mock_inbox:
        mock_inbox.return_value = mock_summary

        res = await client.post(f"/api/v1/outreach/sweep-inbox?account_id={account_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["account"] == "inbox_checker_bot"
        assert data["summary"] == mock_summary
