from pathlib import Path
from unittest.mock import MagicMock
from urllib.parse import quote

import pytest
from playwright.async_api import async_playwright
from pydantic_ai.models.test import TestModel

from app.agent.browser_agent import (
    BrowserAgentDeps,
    browser_sub_agent,
    click_element,
    get_distilled_ui,
    observe_screen,
    scroll_page,
    type_text,
    wait_seconds,
)
from app.platforms.browser.driver import create_stealth_context


@pytest.mark.anyio
async def test_dom_distillation_extracts_interactive_elements(tmp_path: Path):
    """
    Verifies that get_distilled_ui accurately tags interactive elements with
    [data-agent-id] numbers and detects [IN MODAL] dialog scoping.
    """
    test_html = """
    <!DOCTYPE html>
    <html>
    <body>
        <h1>Sandbox Page</h1>
        <button id="nav-btn">Messages</button>
        <input type="text" id="search-box" placeholder="Search creators..." />
        <a href="/profile/sam">@sam</a>
        <div role="dialog" style="display: block;">
            <button id="modal-close">Close Dialog</button>
            <div role="textbox" contenteditable="true" aria-label="Reply box"></div>
        </div>
    </body>
    </html>
    """

    async with async_playwright() as playwright:
        context = await create_stealth_context(
            playwright=playwright,
            user_data_dir=tmp_path / "browser_test_session",
            headless=True,
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(f"data:text/html;charset=utf-8,{quote(test_html)}")

        distilled = await get_distilled_ui(page)

        # 1. Verify interactive elements are indexed
        assert "[1]" in distilled
        assert "Messages" in distilled
        assert "Search creators..." in distilled
        assert "@sam" in distilled

        # 2. Verify modal elements are tagged with [IN MODAL]
        assert "[IN MODAL]" in distilled
        assert "Close Dialog" in distilled

        await context.close()


@pytest.mark.anyio
async def test_sub_agent_tools_execution(tmp_path: Path):
    """
    Verifies that observe_screen, type_text, and click_element interact
    accurately with the browser page.
    """
    test_html = """
    <!DOCTYPE html>
    <html>
    <body style="height: 2000px;">
        <input type="text" id="msg-input" placeholder="Type here..." />
        <button id="send-btn" onclick="document.getElementById('status').innerText = 'SENT'">Send</button>
        <div id="status">UNSENT</div>
    </body>
    </html>
    """

    async with async_playwright() as playwright:
        context = await create_stealth_context(
            playwright=playwright,
            user_data_dir=tmp_path / "browser_tools_session",
            headless=True,
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(f"data:text/html;charset=utf-8,{quote(test_html)}")

        deps = BrowserAgentDeps(
            page=page,
            account_handle="orlume_tester",
            platform="instagram",
        )
        ctx = MagicMock()
        ctx.deps = deps

        # 1. Observe screen
        observed = await observe_screen(ctx)
        assert "[1]" in observed
        assert "Type here..." in observed

        # 2. Type text into input [1]
        await type_text(ctx, agent_id=1, text="Hello AI", press_enter=False)
        val = await page.locator("#msg-input").input_value()
        assert val == "Hello AI"

        # 3. Click Send button [2]
        await click_element(ctx, agent_id=2, description="Send button")
        status_text = await page.locator("#status").inner_text()
        assert status_text == "SENT"

        # 4. Scroll & Wait
        scroll_res = await scroll_page(ctx, direction="down", amount=300)
        assert "CURRENT URL" in scroll_res
        wait_res = await wait_seconds(ctx, seconds=1)
        assert "CURRENT URL" in wait_res

        await context.close()


@pytest.mark.anyio
async def test_browser_sub_agent_react_run_with_test_model(tmp_path: Path):
    """
    Verifies that the browser_sub_agent ReAct loop executes using Pydantic AI's TestModel.
    """
    async with async_playwright() as playwright:
        context = await create_stealth_context(
            playwright=playwright,
            user_data_dir=tmp_path / "sub_agent_session",
            headless=True,
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("data:text/html;charset=utf-8,<html><body><h1>Test</h1></body></html>")

        deps = BrowserAgentDeps(
            page=page,
            account_handle="orlume_tester",
            platform="instagram",
        )

        test_model = TestModel(
            call_tools=["observe_screen"],
            custom_output_text="Inbox checked: Found 0 unread messages.",
        )

        result = await browser_sub_agent.run(
            "Check for unread DMs",
            deps=deps,
            model=test_model,
        )

        assert "Inbox checked: Found 0 unread messages." in str(result.output)
        await context.close()
