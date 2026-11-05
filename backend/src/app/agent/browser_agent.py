"""
Autonomous Browser Exploration & Perception Sub-Agent (DOM Distillation Engine).
Handles unstructured read and exploration tasks:
  1. Reading & triaging Direct Message inboxes (detecting replies, checking message requests).
  2. Scouting and qualifying creator/influencer leads via search and hashtags.
  3. Inspecting competitor profiles and feed sentiment.
"""

import asyncio
from dataclasses import dataclass
from typing import Literal
from urllib.parse import quote

from playwright.async_api import Page, async_playwright
from pydantic_ai import Agent, RunContext

from app.agent.llm import resolve_model
from app.core.logging import get_logger
from app.modules.accounts.models import ConnectedAccount
from app.platforms.browser.driver import create_stealth_context
from app.platforms.browser.session_manager import BrowserSessionManager

logger = get_logger(__name__)

# =============================================================================
# Sub-Agent Context & Prompts
# =============================================================================


@dataclass
class BrowserAgentDeps:
    page: Page
    account_handle: str
    platform: str


BROWSER_AGENT_SYSTEM_PROMPT = """
You are an elite, autonomous Browser Exploration Agent.
You interact with the web interface strictly by reading the distilled text UI state and calling tools.

OPERATIONAL OBJECTIVES:
1. INBOX READING:
   - When checking DMs, look for unread threads, blue dots, or threads where the preview does NOT start with "You:".
   - If a conversation starts with "You:", the prospect has not replied yet — skip it.
   - Always check the "Requests" or "Hidden Requests" tab/button if looking for incoming lead inquiries.
   - Click into relevant conversation threads, read the incoming messages, and extract the lead's exact text and sentiment.

2. INFLUENCER & LEAD SCOUTING:
   - Search target hashtags, niches, or keywords.
   - Inspect candidate profiles, read bios, and check follower counts.
   - Discard obvious bots, theme pages, or spam accounts. Focus on authentic creators, founders, and leaders.

RULES & INTERACTION PATTERNS:
1. Always start by calling `observe_screen` to see the current page elements and text.
2. Only interact with elements using their `[ID]` number (e.g. `click_element(agent_id=5)`).
3. Elements marked [IN MODAL] are inside an active popup dialog — prioritize them if handling a modal.
4. If a "Not Now", "Allow all cookies", or "Save info" popup appears, dismiss it.
5. When your goal is achieved, output your final structured summary clearly.
""".strip()

browser_sub_agent: Agent[BrowserAgentDeps, str] = Agent(
    resolve_model(),
    deps_type=BrowserAgentDeps,
    system_prompt=BROWSER_AGENT_SYSTEM_PROMPT,
)

# =============================================================================
# DOM Distillation Engine (Fast, Token-Efficient Alternative to Vision Pixels)
# =============================================================================

JS_EXTRACT_INTERACTIVE = """
() => {
    document.querySelectorAll('[data-agent-id]').forEach(el => el.removeAttribute('data-agent-id'));

    const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    };

    const svgParents = new Set();
    document.querySelectorAll('svg[aria-label]').forEach(svg => {
        const clickable = svg.closest('button, a, [role="button"], [role="link"]') || svg.parentElement;
        if (clickable) svgParents.add(clickable);
    });

    const selectors = [
        'a[href]', 'button', 'input', 'textarea', 'select',
        '[role="button"]', '[role="link"]', '[role="textbox"]',
        '[role="menuitem"]', '[role="tab"]', '[role="row"]',
        '[contenteditable="true"]', '[data-testid]'
    ].join(',');

    const candidates = new Set([...document.querySelectorAll(selectors), ...svgParents]);
    let idCounter = 1;
    let lines = [];

    for (const el of candidates) {
        if (!isVisible(el)) continue;

        let label = (
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('data-testid') ||
            el.innerText ||
            el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ||
            el.querySelector('img[alt]')?.getAttribute('alt') ||
            ''
        ).replace(/\\s+/g, ' ').trim();

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || tag;
        const typeAttr = el.getAttribute('type') ? ` type="${el.getAttribute('type')}"` : '';
        const hrefAttr = el.getAttribute('href') ? ` href="${el.getAttribute('href')}"` : '';
        const inModal = el.closest('[role="dialog"]') ? '[IN MODAL] ' : '';

        if (!label && !['input', 'textarea'].includes(tag) && role !== 'textbox') continue;

        el.setAttribute('data-agent-id', idCounter);
        lines.push(`[${idCounter}] ${inModal}<${role}${typeAttr}${hrefAttr}> "${label.slice(0, 110)}"`);
        idCounter++;
        if (idCounter > 75) break; // Cap per screen to keep prompt compact
    }

    return lines.join('\\n');
}
"""


async def get_distilled_ui(page: Page) -> str:
    """
    Distills visible interactive DOM elements into indexed [agent-id] items
    paired with Playwright's native ARIA accessibility tree snapshot.
    """
    try:
        interactive_list = await page.evaluate(JS_EXTRACT_INTERACTIVE)
    except Exception as exc:
        interactive_list = f"(Error evaluating interactive elements: {exc})"

    # Capture ARIA snapshot (dialog-scoped if modal is open)
    try:
        dialog = page.get_by_role("dialog").first
        if await dialog.is_visible(timeout=1000):
            aria_tree = await dialog.aria_snapshot()
        else:
            aria_tree = await page.locator("body").aria_snapshot()
        aria_lines = "\n".join(aria_tree.splitlines()[:50])
    except Exception:
        aria_lines = "(ARIA accessibility tree unavailable)"

    return (
        f"CURRENT URL: {page.url}\n\n"
        f"=== INTERACTIVE ELEMENTS (Pass the [ID] number to tools) ===\n"
        f"{interactive_list or '(No interactive elements visible)'}\n\n"
        f"=== PAGE TEXT / ARIA CONTEXT ===\n"
        f"{aria_lines}"
    )


# =============================================================================
# Sub-Agent Tools (Perception & Motor Control)
# =============================================================================


@browser_sub_agent.tool
async def observe_screen(ctx: RunContext[BrowserAgentDeps]) -> str:
    """Reads the current visible UI elements, text, and interactive buttons on screen."""
    await asyncio.sleep(1.0)
    return await get_distilled_ui(ctx.deps.page)


@browser_sub_agent.tool
async def click_element(
    ctx: RunContext[BrowserAgentDeps], agent_id: int, description: str
) -> str:
    """Clicks an interactive element by its numeric `[agent_id]` number."""
    page = ctx.deps.page
    target = page.locator(f'[data-agent-id="{agent_id}"]').first

    try:
        try:
            await target.click(timeout=4000)
        except Exception:
            await target.click(force=True, timeout=4000)
        await asyncio.sleep(2.0)
        return await get_distilled_ui(page)
    except Exception as exc:
        return f"ERROR clicking [{agent_id}] ({description}): {exc}\n\n" + await get_distilled_ui(page)


@browser_sub_agent.tool
async def type_text(
    ctx: RunContext[BrowserAgentDeps],
    agent_id: int,
    text: str,
    press_enter: bool = False,
) -> str:
    """Types text into an input or textbox element identified by `[agent_id]`."""
    page = ctx.deps.page
    target = page.locator(f'[data-agent-id="{agent_id}"]').first

    try:
        tag = await target.evaluate("el => el.tagName.toLowerCase()", timeout=3000)
        try:
            await target.click(timeout=2500)
        except Exception:
            await target.click(force=True, timeout=2500)

        await asyncio.sleep(0.3)
        if tag in ("input", "textarea"):
            await target.fill(text, force=True)
        else:
            await page.keyboard.insert_text(text)

        if press_enter:
            await asyncio.sleep(0.4)
            await page.keyboard.press("Enter")

        await asyncio.sleep(2.0)
        return await get_distilled_ui(page)
    except Exception as exc:
        return f"ERROR typing into [{agent_id}]: {exc}\n\n" + await get_distilled_ui(page)


@browser_sub_agent.tool
async def scroll_page(
    ctx: RunContext[BrowserAgentDeps],
    direction: Literal["down", "up"] = "down",
    amount: int = 500,
) -> str:
    """Scrolls the page up or down to reveal more messages, posts, or profiles."""
    page = ctx.deps.page
    delta = amount if direction == "down" else -amount
    await page.mouse.wheel(0, delta)
    await asyncio.sleep(1.8)
    return await get_distilled_ui(page)


@browser_sub_agent.tool
async def navigate_to(ctx: RunContext[BrowserAgentDeps], url: str) -> str:
    """Navigates the browser directly to a specific URL."""
    page = ctx.deps.page
    try:
        await page.goto(url, wait_until="domcontentloaded")
        await asyncio.sleep(3.0)
        return await get_distilled_ui(page)
    except Exception as exc:
        return f"ERROR navigating to {url}: {exc}\n\n" + await get_distilled_ui(page)


@browser_sub_agent.tool
async def wait_seconds(ctx: RunContext[BrowserAgentDeps], seconds: int = 3) -> str:
    """Waits for a specified duration (capped at 10 seconds)."""
    await asyncio.sleep(min(max(1, seconds), 10))
    return await get_distilled_ui(ctx.deps.page)


# =============================================================================
# High-Level Autonomous Orchestrators
# =============================================================================


async def run_browser_agent_task(
    account: ConnectedAccount,
    task_prompt: str,
    start_url: str | None = None,
    headless: bool = True,
    max_turns: int = 15,
) -> str:
    """
    Core lifecycle orchestrator:
    1. Launches stealth Chromium using the account's isolated session profile & cookies.
    2. Navigates to the initial starting URL.
    3. Runs the Pydantic AI Browser Sub-Agent loop with DOM distillation.
    4. Dumps updated session cookies and shuts down browser resources cleanly.
    """
    session_mgr = BrowserSessionManager()
    user_data_dir = session_mgr.get_account_session_dir(account.id)
    storage_state_path = session_mgr.get_storage_state_path(account.id)

    default_url = (
        "https://www.instagram.com/"
        if account.platform.value == "instagram"
        else "https://x.com/home"
    )
    initial_url = start_url or default_url

    logger.info(
        "Launching Browser AI Agent for @%s (%s) on task: %s",
        account.handle,
        account.platform.value,
        task_prompt[:80],
    )

    async with async_playwright() as playwright:
        context = await create_stealth_context(
            playwright=playwright,
            user_data_dir=user_data_dir,
            headless=headless,
            storage_state_path=storage_state_path if storage_state_path.exists() else None,
        )

        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(initial_url, wait_until="domcontentloaded")
        await asyncio.sleep(2.5)

        # Auto-dismiss common popups
        for not_now in ["Not Now", "Not now", "Cancel"]:
            try:
                btn = page.get_by_role("button", name=not_now, exact=True).first
                if await btn.is_visible(timeout=1000):
                    await btn.click()
                    await asyncio.sleep(0.5)
            except Exception:
                pass

        deps = BrowserAgentDeps(
            page=page,
            account_handle=account.handle,
            platform=account.platform.value,
        )

        try:
            result = await browser_sub_agent.run(
                task_prompt,
                deps=deps,
                model_settings={"max_tokens": 1500},
            )
            output_text = str(result.output)
        except Exception as exc:
            logger.error("Browser agent execution error: %s", exc, exc_info=True)
            output_text = f"Browser Agent stopped: {exc}"
        finally:
            await session_mgr.save_session_state(context, account.id)
            await context.close()

        return output_text


async def read_and_summarize_inbox(
    account: ConnectedAccount,
    specific_user: str | None = None,
    headless: bool = True,
) -> str:
    """
    Dedicated Inbox Reader:
    Scans direct message inbox, checks for message requests or new incoming replies,
    opens relevant threads, and extracts context for the main Copilot.
    """
    inbox_url = (
        "https://www.instagram.com/direct/inbox/"
        if account.platform.value == "instagram"
        else "https://x.com/messages"
    )

    if specific_user:
        prompt = (
            f"You are checking messages for user @{specific_user}. "
            f"First check the conversation list on the screen. If you see @{specific_user}, click on their thread. "
            f"If you do not see them, look for a search or filter input, or click 'Requests' to see if their message is pending. "
            f"Once you open their conversation thread, read the last 3-5 messages. "
            f"Determine if @{specific_user} has replied to us, summarize what they said, and report their sentiment."
        )
    else:
        prompt = (
            "You are doing a general inbox sweep. "
            "1. Check the conversation list for any unread threads, threads with blue dots, or threads where the preview does NOT start with 'You:'. "
            "2. Also check if there is a 'Requests' tab with unread inquiries. "
            "3. If you find any threads with incoming replies from leads, click into the top 2 threads, read what they sent, and summarize who replied and what they asked for. "
            "4. If all threads start with 'You: ...' and there are no requests, report that there are no new replies yet."
        )

    return await run_browser_agent_task(
        account=account,
        task_prompt=prompt,
        start_url=inbox_url,
        headless=headless,
    )


async def scout_influencer_leads(
    account: ConnectedAccount,
    niche_or_query: str,
    max_leads: int = 5,
    headless: bool = True,
) -> str:
    """
    Dedicated Influencer & Lead Scout:
    Navigates search/explore, inspects candidate creator profiles, evaluates bios
    and follower counts, and returns a structured list of vetted prospects.
    """
    is_ig = account.platform.value == "instagram"
    clean_query = niche_or_query.strip().lstrip("#")
    start_url = (
        f"https://www.instagram.com/explore/tags/{clean_query}/"
        if is_ig
        else f"https://x.com/search?q={quote(niche_or_query)}&f=user"
    )

    prompt = (
        f"You are scouting qualified influencer/creator leads for niche '{niche_or_query}'. "
        f"Goal: Find up to {max_leads} authentic creator profiles. "
        f"1. Browse the current search or explore page. Click on creator profiles or post authors. "
        f"2. Inspect their bio, display name, handle, and follower count. "
        f"3. Discard spam accounts, brands, or theme repost pages. Only select authentic individual creators/founders. "
        f"4. Output your final answer as a structured JSON list: "
        f'[{{"handle": "username", "display_name": "Name", "bio": "Bio snippet", "follower_count": 15000, "reason": "Why they fit"}}]'
    )

    return await run_browser_agent_task(
        account=account,
        task_prompt=prompt,
        start_url=start_url,
        headless=headless,
    )
