import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import AgentDeps
from app.agent.tools.account_tools import (
    check_account_health,
    get_connected_accounts,
)
from app.agent.tools.approval_tools import request_human_approval
from app.agent.tools.autonomous_tools import (
    ask_human_for_help,
    evaluate_marketing_performance,
    sleep,
)
from app.agent.tools.brand_tools import get_brand_knowledge
from app.agent.tools.campaign_tools import (
    draft_campaign,
    list_pending_posts,
    queue_social_post,
    schedule_existing_post,
)
from app.agent.tools.connector_tools import (
    get_competitor_keyword_gaps,
    get_search_console_opportunities,
    list_marketing_data_sources,
)
from app.agent.tools.outreach_tools import (
    add_lead_to_crm,
    dispatch_dm_now,
    list_crm_leads,
    review_staged_dm,
    stage_cold_outreach_dm,
)
from app.agent.tools.trigger_tools import (
    add_competitor_to_watch,
    create_keyword_trigger_rule,
    review_intercepted_match,
)
from app.common.enums import (
    AutonomyLevel,
    ConnectorType,
    OutreachMessageStatus,
    PlatformType,
)
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.service import AccountService
from app.modules.brand.commands import UpdateBrandKitCommand
from app.modules.brand.service import BrandService
from app.modules.connectors.commands import CreateConnectorCommand
from app.modules.connectors.schemas import MetricOpportunityItem
from app.modules.connectors.service import ConnectorService
from app.modules.outreach.commands import ReviewMessageCommand
from app.modules.outreach.service import OutreachService
from app.modules.strategist.service import StrategistService


def _make_run_context(db_session: AsyncSession) -> Any:
    """Constructs a lightweight RunContext mock carrying AgentDeps."""
    ctx = MagicMock()
    lock = asyncio.Lock()
    ctx.deps = AgentDeps(db=db_session, _async_lock=lock)

    @asynccontextmanager
    async def mock_scope() -> AsyncGenerator[AsyncSession, None]:
        async with lock:
            yield db_session

    ctx.deps.db_session_scope = mock_scope
    return ctx


# =============================================================================
# Account Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_account_tools_execution_and_error_handling(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = await acc_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="agent_growth_bot",
            daily_post_limit=12,
            daily_dm_limit=20,
        )
    )

    accounts_list = await get_connected_accounts(ctx, active_only=True)
    assert len(accounts_list) == 1
    assert accounts_list[0]["handle"] == "agent_growth_bot"
    assert accounts_list[0]["can_post_today"] is True

    health = await check_account_health(ctx, account_id=str(account.id))
    assert health["handle"] == "agent_growth_bot"
    assert health["remaining_posts_today"] == 12
    assert health["remaining_dms_today"] == 20

    bad_uuid_res = await check_account_health(ctx, account_id="not-a-valid-uuid")
    assert "error" in bad_uuid_res

    missing_res = await check_account_health(ctx, account_id=str(uuid4()))
    assert "error" in missing_res


# =============================================================================
# Campaign Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_campaign_tools_execution_and_error_handling(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = await acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="camp_tool_bot")
    )

    camp_res = await draft_campaign(
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

    draft_post = await queue_social_post(
        ctx,
        campaign_id=campaign_id,
        account_id=str(account.id),
        content="Drafting our new AI Marketing Agent launch!",
    )
    assert draft_post["status"] == "draft"

    scheduled_res = await schedule_existing_post(
        ctx,
        post_id=draft_post["id"],
        scheduled_at_iso=(datetime.now(UTC) + timedelta(minutes=10)).isoformat(),
    )
    assert scheduled_res["status"] == "scheduled"

    pending = await list_pending_posts(ctx, limit=5)
    assert len(pending) == 1
    assert pending[0]["id"] == draft_post["id"]

    err_res = await queue_social_post(
        ctx,
        campaign_id=str(uuid4()),
        account_id=str(account.id),
        content="Should fail gracefully",
    )
    assert "error" in err_res


# =============================================================================
# Trigger Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_trigger_tools_execution_and_error_handling(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    account = await acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="trigger_tool_bot")
    )

    watch_res = await add_competitor_to_watch(
        ctx,
        platform="twitter",
        handle="@competitor_hq",
        display_name="Competitor HQ",
    )
    assert watch_res["handle"] == "competitor_hq"
    assert watch_res["platform"] == "twitter"

    rule_res = await create_keyword_trigger_rule(
        ctx,
        name="Alternative Finder",
        platform="twitter",
        account_id=str(account.id),
        keywords_any=["expensive", "alternative"],
        response_template="Hey @{author}, check us out!",
    )
    assert "id" in rule_res
    assert rule_res["name"] == "Alternative Finder"

    review_err = await review_intercepted_match(
        ctx,
        match_id=str(uuid4()),
        approve=True,
    )
    assert "error" in review_err


# =============================================================================
# Outreach & Full-Auto / Staged-Review Tools Unit Tests
# =============================================================================

@pytest.mark.anyio
async def test_outreach_tools_and_autonomy_modes(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    strategist_service = StrategistService(db_session)
    outreach_service = OutreachService(db_session)

    account = await acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="outreach_tool_bot")
    )

    lead_res = await add_lead_to_crm(
        ctx,
        platform="twitter",
        handle="@tech_creator",
        display_name="Tech Creator",
        bio="Building developer tools",
        follower_count=35000,
        tags=["devtools"],
    )
    lead_id = lead_res["id"]

    leads_list = await list_crm_leads(ctx, platform="twitter")
    assert len(leads_list) == 1

    # 1. Stage Cold DM in STAGED_REVIEW mode
    await strategist_service.set_autonomy_level(AutonomyLevel.STAGED_REVIEW)
    stage_res = await stage_cold_outreach_dm(
        ctx,
        lead_id=lead_id,
        account_id=str(account.id),
        message_content="Hey Tech Creator, love your devtool reviews!",
    )
    assert stage_res["status"] == "staged"
    assert stage_res["auto_approved"] is False
    message_id = stage_res["id"]

    # request_human_approval in STAGED_REVIEW requires human decision
    gate_staged = await request_human_approval(
        ctx,
        action_type="outreach_dm",
        title="Send DM to @tech_creator?",
        description="Hey Tech Creator!",
        entity_id=message_id,
    )
    assert gate_staged["approval_required"] is True
    assert gate_staged["auto_approved"] is False

    # Review and approve the staged message via review_staged_dm tool
    review_res = await review_staged_dm(
        ctx,
        message_id=message_id,
        approve=True,
        edited_content="Hey Tech Creator, let's collaborate.",
    )
    assert review_res["status"] == "approved"

    # Dispatch the approved DM
    mock_adapter = MagicMock()
    mock_adapter.send_dm = AsyncMock(return_value="thread_xyz_999")
    mock_adapter.close = AsyncMock()

    with patch(
        "app.agent.tools.outreach_tools.PlatformRegistry.get_adapter",
        return_value=mock_adapter,
    ):
        dispatch_res = await dispatch_dm_now(ctx, message_id=message_id)
        assert dispatch_res["status"] == "dispatched"
        assert dispatch_res["platform_thread_id"] == "thread_xyz_999"

    # 2. Switch to FULL_AUTO mode: stage_cold_outreach_dm & request_human_approval auto-approve!
    lead_auto = await add_lead_to_crm(ctx, platform="twitter", handle="@auto_lead")
    await strategist_service.set_autonomy_level(AutonomyLevel.FULL_AUTO)

    auto_dm = await stage_cold_outreach_dm(
        ctx,
        lead_id=lead_auto["id"],
        account_id=str(account.id),
        message_content="Full auto pitch!",
    )
    assert auto_dm["status"] == "approved"
    assert auto_dm["auto_approved"] is True

    # Calling request_human_approval on an already-approved DM in FULL_AUTO is idempotent
    gate_auto = await request_human_approval(
        ctx,
        action_type="outreach_dm",
        title="Approve DM to @auto_lead?",
        description="Full auto pitch!",
        entity_id=auto_dm["id"],
    )
    assert gate_auto["approval_required"] is False
    assert gate_auto["auto_approved"] is True

    # 3. Stage a third DM in STAGED_REVIEW and reject it to test closed-loop review outcomes
    lead_rejected = await add_lead_to_crm(ctx, platform="twitter", handle="@rejected_lead")
    await strategist_service.set_autonomy_level(AutonomyLevel.STAGED_REVIEW)
    dm_rej = await stage_cold_outreach_dm(
        ctx, lead_rejected["id"], str(account.id), "Generic pitch"
    )
    await outreach_service.review_message(
        ReviewMessageCommand(
            message_id=dm_rej["id"],
            status=OutreachMessageStatus.REJECTED,
            rejection_reason="Too generic",
        )
    )

    perf = await evaluate_marketing_performance(ctx)
    outcomes = perf["review_queue_outcomes"]
    assert len(outcomes["approved_and_dispatched_dms"]) == 2
    assert len(outcomes["rejected_dms_by_human"]) == 1
    assert outcomes["rejected_dms_by_human"][0]["lead_handle"] == "rejected_lead"
    assert outcomes["rejected_dms_by_human"][0]["reason"] == "Too generic"

# =============================================================================
# Autonomous Sleep & Human Help Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_autonomous_sleep_and_help_tools(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)

    sleep_res = await sleep(ctx, duration_minutes=45, rationale="Resting until peak hours.")
    assert sleep_res["status"] == "sleeping"
    assert sleep_res["duration_minutes"] == 45

    help_res = await ask_human_for_help(
        ctx,
        urgency="medium",
        question="Which persona should we prioritize this week?",
        context={"options": ["Founders", "Agencies"]},
    )
    assert help_res["status"] == "waiting_for_human"
    assert help_res["urgency"] == "medium"


# =============================================================================
# Brand & Connector Tools Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_brand_and_connector_tools_execution(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    brand_service = BrandService(db_session)
    conn_service = ConnectorService(db_session)

    primary_kit = await brand_service.get_or_create_default_primary()
    await brand_service.update_brand_kit(
        UpdateBrandKitCommand(
            brand_kit_id=primary_kit.id,
            name="Acme Growth",
            website_url="https://acme.ai",
            tone_traits=["punchy", "direct"],
            banned_words=["delve"],
        )
    )

    knowledge = await get_brand_knowledge(ctx)
    assert knowledge["brand_name"] == "Acme Growth"
    assert "delve" in knowledge["banned_words_never_use"]

    await conn_service.create_connector(
        CreateConnectorCommand(
            name="GSC Production",
            connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE,
            target_identifier="https://orlume.site",
            refresh_token="tok_123",
        )
    )

    sources = await list_marketing_data_sources(ctx)
    assert len(sources) == 1

    no_ahrefs = await get_competitor_keyword_gaps(ctx)
    assert "warning" in no_ahrefs[0]

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

    with patch(
        "app.modules.connectors.service.ConnectorService.fetch_opportunities",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_fetch.return_value = mock_opps
        opps = await get_search_console_opportunities(ctx, min_impressions=500)
        assert len(opps) == 1
        assert opps[0]["query"] == "ai landing page builder"


# =============================================================================
# Parallel Tool Execution Async Safety Test
# =============================================================================


@pytest.mark.anyio
async def test_parallel_tool_calls_async_safety(db_session: AsyncSession) -> None:
    ctx = _make_run_context(db_session)
    acc_service = AccountService(db_session)
    await acc_service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="parallel_tester")
    )

    results = await asyncio.gather(
        get_connected_accounts(ctx),
        get_brand_knowledge(ctx),
        add_lead_to_crm(ctx, platform="instagram", handle="parallel_lead_1"),
        list_crm_leads(ctx),
    )

    assert len(results) == 4
    assert results[0][0]["handle"] == "parallel_tester"
    assert "brand_name" in results[1]
    assert results[2]["handle"] == "parallel_lead_1"
    assert len(results[3]) == 1
