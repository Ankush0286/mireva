from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.agent.llm import AgentDeps
from app.agent.tools.account_tools import (
    check_account_health,
    get_connected_accounts,
)
from app.agent.tools.brand_tools import get_brand_knowledge
from app.agent.tools.campaign_tools import (
    draft_campaign,
    list_pending_posts,
    queue_social_post,
)
from app.agent.tools.connector_tools import (
    get_competitor_keyword_gaps,
    get_search_console_opportunities,
    list_marketing_data_sources,
)
from app.agent.tools.outreach_tools import (
    add_lead_to_crm,
    review_staged_dm,
    stage_cold_outreach_dm,
)
from app.agent.tools.trigger_tools import (
    add_competitor_to_watch,
    create_keyword_trigger_rule,
    review_intercepted_match,
)
from app.common.enums import ConnectorType, PlatformType
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.service import AccountService
from app.modules.connectors.commands import CreateConnectorCommand
from app.modules.connectors.schemas import MetricOpportunityItem
from app.modules.connectors.service import ConnectorService


def _make_run_context(db_session: Session) -> Any:
    """Constructs a lightweight RunContext mock carrying AgentDeps."""
    ctx = MagicMock()
    ctx.deps = AgentDeps(db=db_session)
    return ctx


# =============================================================================
# Account Tools Unit Tests
# =============================================================================


def test_account_tools_execution_and_error_handling(db_session: Session):
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = acc_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="agent_growth_bot",
            daily_post_limit=12,
            daily_dm_limit=20,
        )
    )

    # 1. List connected accounts
    accounts_list = get_connected_accounts(ctx, active_only=True)
    assert len(accounts_list) == 1
    assert accounts_list[0]["handle"] == "agent_growth_bot"
    assert accounts_list[0]["can_post_today"] is True

    # 2. Check specific account health
    health = check_account_health(ctx, account_id=str(account.id))
    assert health["handle"] == "agent_growth_bot"
    assert health["remaining_posts_today"] == 12
    assert health["remaining_dms_today"] == 20

    # 3. Graceful error recovery on malformed or nonexistent UUID
    bad_uuid_res = check_account_health(ctx, account_id="not-a-valid-uuid")
    assert "error" in bad_uuid_res

    missing_res = check_account_health(ctx, account_id=str(uuid4()))
    assert "error" in missing_res


# =============================================================================
# Campaign Tools Unit Tests
# =============================================================================


def test_campaign_tools_execution_and_error_handling(db_session: Session):
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="camp_tool_bot")
    )

    # 1. Draft a campaign
    camp_res = draft_campaign(
        ctx,
        name="AI Launch Campaign",
        description="Promoting new autonomous agent features",
        target_audience="SaaS Founders",
        tags=["ai", "saas"],
    )
    assert "id" in camp_res
    assert camp_res["name"] == "AI Launch Campaign"
    assert camp_res["status"] == "active"
    campaign_id = camp_res["id"]

    # 2. Queue a due social post
    past_due_iso = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    post_res = queue_social_post(
        ctx,
        campaign_id=campaign_id,
        account_id=str(account.id),
        content="Launching our new AI Marketing Agent today! 🚀",
        scheduled_at_iso=past_due_iso,
    )
    assert "id" in post_res
    assert post_res["status"] == "scheduled"

    # 3. List pending due posts
    pending = list_pending_posts(ctx, limit=5)
    assert len(pending) == 1
    assert pending[0]["id"] == post_res["id"]

    # 4. Graceful error recovery when queuing on nonexistent campaign
    err_res = queue_social_post(
        ctx,
        campaign_id=str(uuid4()),
        account_id=str(account.id),
        content="Should fail gracefully",
    )
    assert "error" in err_res


# =============================================================================
# Trigger Tools Unit Tests
# =============================================================================


def test_trigger_tools_execution_and_error_handling(db_session: Session):
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="trigger_tool_bot")
    )

    # 1. Add competitor to watch
    watch_res = add_competitor_to_watch(
        ctx,
        platform="twitter",
        handle="@competitor_hq",
        display_name="Competitor HQ",
    )
    assert watch_res["handle"] == "competitor_hq"
    assert watch_res["platform"] == "twitter"

    # 2. Create keyword trigger rule
    rule_res = create_keyword_trigger_rule(
        ctx,
        name="Alternative Finder",
        platform="twitter",
        account_id=str(account.id),
        keywords_any=["expensive", "alternative"],
        response_template="Hey @{author}, check us out!",
    )
    assert "id" in rule_res
    assert rule_res["name"] == "Alternative Finder"

    # 3. Graceful error recovery on nonexistent match review
    review_err = review_intercepted_match(
        ctx,
        match_id=str(uuid4()),
        approve=True,
    )
    assert "error" in review_err


# =============================================================================
# Outreach Tools Unit Tests
# =============================================================================


def test_outreach_tools_execution_and_error_handling(db_session: Session):
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="outreach_tool_bot")
    )

    # 1. Add lead to CRM
    lead_res = add_lead_to_crm(
        ctx,
        platform="twitter",
        handle="@tech_creator",
        display_name="Tech Creator",
        bio="Building developer tools",
        follower_count=35000,
        tags=["devtools"],
    )
    assert "id" in lead_res
    assert lead_res["handle"] == "tech_creator"
    assert lead_res["stage"] == "discovered"
    lead_id = lead_res["id"]

    # 2. Stage cold outreach DM
    stage_res = stage_cold_outreach_dm(
        ctx,
        lead_id=lead_id,
        account_id=str(account.id),
        message_content="Hey Tech Creator, love your devtool reviews!",
    )
    assert "id" in stage_res
    assert stage_res["status"] == "staged"
    message_id = stage_res["id"]

    # 3. Review and approve staged DM
    review_res = review_staged_dm(
        ctx,
        message_id=message_id,
        approve=True,
        edited_content="Hey Tech Creator, love your devtool reviews! Let's collaborate.",
    )
    assert review_res["status"] == "approved"
    assert "Let's collaborate." in review_res["content"]

    # 4. Graceful error recovery on duplicate lead import
    dup_err = add_lead_to_crm(
        ctx,
        platform="twitter",
        handle="tech_creator",
    )
    assert "error" in dup_err


# =============================================================================
# Brand Tools Unit Tests
# =============================================================================


def test_brand_tools_execution(db_session: Session):
    ctx = _make_run_context(db_session)

    # 1. Query full brand knowledge (auto-seeds default Orlume kit)
    knowledge = get_brand_knowledge(ctx)
    assert knowledge["brand_name"] == "Orlume"
    assert "https://orlume.site" in knowledge["website_url"]
    assert "punchy" in knowledge["tone_traits"]
    assert "delve" in knowledge["banned_words_never_use"]
    assert len(knowledge["target_personas"]) >= 1

    # 2. Query specific section: tone & voice
    tone_sec = get_brand_knowledge(ctx, section="tone")
    assert "tone_traits" in tone_sec
    assert "banned_words_never_use" in tone_sec
    assert "target_personas" not in tone_sec

    # 3. Query specific section: personas
    personas_sec = get_brand_knowledge(ctx, section="personas")
    assert "target_personas" in personas_sec
    assert "tone_traits" not in personas_sec


# =============================================================================
# Data Connector Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_connector_tools_execution_and_warnings(db_session: Session):
    ctx = _make_run_context(db_session)
    conn_service = ConnectorService(db_session)

    # 1. List data sources on empty DB
    empty_sources = await list_marketing_data_sources(ctx)
    assert len(empty_sources) == 0

    # 2. Warning on query with no active connectors configured
    no_gsc = await get_search_console_opportunities(ctx)
    assert "warning" in no_gsc[0]

    no_ahrefs = await get_competitor_keyword_gaps(ctx)
    assert "warning" in no_ahrefs[0]

    # 3. Register GSC connector and query opportunities via mock
    conn_service.create_connector(
        CreateConnectorCommand(
            name="GSC Production",
            connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
            target_identifier="https://orlume.site",
            refresh_token="tok_123",
        )
    )

    sources = await list_marketing_data_sources(ctx)
    assert len(sources) == 1
    assert sources[0]["name"] == "GSC Production"

    mock_opps = [
        MetricOpportunityItem(
            query="ai landing page builder",
            page_url="https://orlume.site/builder",
            impressions=1800,
            clicks=62,
            ctr=0.034,
            position=6.2,
            opportunity_type="striking_distance",
            score=79.5,
        )
    ]

    with patch("app.modules.connectors.service.ConnectorService.fetch_opportunities", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_opps

        opps = await get_search_console_opportunities(ctx, min_impressions=500)
        assert len(opps) == 1
        assert opps[0]["query"] == "ai landing page builder"
        assert opps[0]["score"] == 79.5
