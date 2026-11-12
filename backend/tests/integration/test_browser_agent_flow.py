from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.browser_agent import (
    read_and_summarize_inbox,
    scout_influencer_leads,
)
from app.agent.llm import AgentDeps
from app.agent.tools.outreach_tools import (
    read_inbox_with_browser_agent,
    scout_creators_with_browser_agent,
)
from app.common.enums import PlatformType
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.service import AccountService


async def _create_sample_account(db: AsyncSession, handle: str = "agent_scout_bot"):
    service = AccountService(db)
    return await service.create_account(
        CreateAccountCommand(
            platform=PlatformType.INSTAGRAM,
            handle=handle,
            display_name="Scout Bot",
            daily_dm_limit=15,
        )
    )


@pytest.mark.anyio
async def test_read_and_summarize_inbox_orchestration(db_session: AsyncSession):
    account = await _create_sample_account(db_session, "inbox_bot")

    mock_summary = "Checked inbox: Found 1 reply from @billgates saying 'Sounds good!'"

    with patch(
        "app.agent.browser_agent.run_browser_agent_task", new_callable=AsyncMock
    ) as mock_task:
        mock_task.return_value = mock_summary

        result = await read_and_summarize_inbox(
            account=account,
            specific_user="billgates",
            headless=True,
        )

        assert result == mock_summary
        mock_task.assert_called_once()
        _, kwargs = mock_task.call_args
        assert kwargs["account"] == account
        assert "billgates" in kwargs["task_prompt"]
        assert "https://www.instagram.com/direct/inbox/" in kwargs["start_url"]


@pytest.mark.anyio
async def test_scout_influencer_leads_orchestration(db_session: AsyncSession):
    account = await _create_sample_account(db_session, "scout_tester")

    mock_report = '[{"handle": "indie_dev", "follower_count": 22000, "bio": "SaaS Builder"}]'

    with patch(
        "app.agent.browser_agent.run_browser_agent_task", new_callable=AsyncMock
    ) as mock_task:
        mock_task.return_value = mock_report

        result = await scout_influencer_leads(
            account=account,
            niche_or_query="buildinpublic",
            max_leads=3,
            headless=True,
        )

        assert result == mock_report
        mock_task.assert_called_once()
        _, kwargs = mock_task.call_args
        assert "buildinpublic" in kwargs["task_prompt"]
        assert "https://www.instagram.com/explore/tags/buildinpublic/" in kwargs["start_url"]


@pytest.mark.anyio
async def test_main_agent_invokes_browser_tools(db_session: AsyncSession):
    account = await _create_sample_account(db_session, "main_agent_user")

    ctx = AsyncMock()
    ctx.deps = AgentDeps(db=db_session)

    # 1. Test read_inbox_with_browser_agent tool
    with patch(
        "app.agent.tools.outreach_tools.read_and_summarize_inbox", new_callable=AsyncMock
    ) as mock_inbox:
        mock_inbox.return_value = "Inbox clear. 0 unread messages."

        inbox_res = await read_inbox_with_browser_agent(
            ctx,
            account_id=str(account.id),
            specific_user="billgates",
        )
        assert inbox_res["account_handle"] == "main_agent_user"
        assert inbox_res["inbox_summary"] == "Inbox clear. 0 unread messages."

    # 2. Test scout_creators_with_browser_agent tool
    with patch(
        "app.agent.tools.outreach_tools.scout_influencer_leads", new_callable=AsyncMock
    ) as mock_scout:
        mock_scout.return_value = '[{"handle": "ai_founder", "followers": 14000}]'

        scout_res = await scout_creators_with_browser_agent(
            ctx,
            account_id=str(account.id),
            niche_or_hashtag="ai",
            max_leads=5,
        )
        assert scout_res["niche"] == "ai"
        assert "ai_founder" in scout_res["scout_report"]


@pytest.mark.anyio
async def test_browser_tools_error_recovery_on_invalid_account(db_session: AsyncSession):
    ctx = AsyncMock()
    ctx.deps = AgentDeps(db=db_session)

    # The tool catches AccountNotFoundError and returns {"error": ...} safely
    result = await read_inbox_with_browser_agent(ctx, account_id=str(uuid4()))
    assert "error" in result
    assert "was not found" in result["error"]
