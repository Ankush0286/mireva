"""
Interactive Action Recorder:
Usage: uv run python -m app.platforms.browser.recorder --platform instagram
"""

import argparse
import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

from app.db.session import session_factory
from app.modules.accounts.models import ConnectedAccount
from app.platforms.browser.driver import create_stealth_context
from app.platforms.browser.session_manager import BrowserSessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RECORDER_INJECTION_JS = """
(() => {
    if (window.__gc_recorder_initialized) return;
    window.__gc_recorder_initialized = true;

    const getElementSelectors = (el) => {
        const selectors = [];
        if (!el || !el.getAttribute) return selectors;

        const ariaLabel = el.getAttribute('aria-label');
        const testId = el.getAttribute('data-testid');
        const role = el.getAttribute('role');
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const text = (el.innerText || el.textContent || '').trim();

        // Scope to modal if inside an active dialog for ultra-high specificity
        const inDialog = Boolean(el.closest('[role="dialog"]'));
        const prefix = inDialog ? '[role="dialog"] ' : '';

        if (ariaLabel) {
            selectors.push(`${prefix}[aria-label="${ariaLabel}"]`);
            if (inDialog) selectors.push(`[aria-label="${ariaLabel}"]`);
        }
        if (testId) {
            selectors.push(`${prefix}[data-testid="${testId}"]`);
        }
        if (role && text && text.length < 30) {
            selectors.push(`${prefix}[role="${role}"]:has-text("${text.replace(/"/g, '\\\\"')}")`);
            if (inDialog) selectors.push(`[role="${role}"]:has-text("${text.replace(/"/g, '\\\\"')}")`);
        }
        if (text && text.length < 30 && ['button', 'a', 'span', 'div'].includes(tag)) {
            selectors.push(`${prefix}${tag}:has-text("${text.replace(/"/g, '\\\\"')}")`);
            if (inDialog) selectors.push(`${tag}:has-text("${text.replace(/"/g, '\\\\"')}")`);
        }
        if (el.id) selectors.push(`#${el.id}`);
        return selectors;
    };

    const sendStep = (step) => {
        if (window.__gc_record_step) {
            window.__gc_record_step(JSON.stringify(step));
        }
    };

    // 1. Capture Clicks ONLY on truly interactive elements (filters out stray header/background clicks)
    document.addEventListener('click', (e) => {
        const target = e.target.closest('button, a, div[role="button"], [role="menuitem"], [role="tab"], svg[aria-label], [aria-label], [role="textbox"], [contenteditable="true"]');
        if (!target) return;

        const text = (target.innerText || target.textContent || '').trim();
        const aria = target.getAttribute ? target.getAttribute('aria-label') : '';
        const desc = aria || (text ? text.slice(0, 25) : target.tagName.toLowerCase());

        sendStep({
            type: 'click',
            description: `Click "${desc}"`,
            selectors: getElementSelectors(target),
            timestamp: Date.now()
        });
    }, true);

    // 2. Capture File Upload Inputs
    document.addEventListener('change', (e) => {
        if (e.target && e.target.type === 'file') {
            sendStep({
                type: 'upload',
                description: 'Upload media file',
                target: 'input[type="file"]',
                variable: 'media_path',
                selectors: ['button:has-text("Select from computer")', '[role="button"]:has-text("Select from computer")'],
                timestamp: Date.now()
            });
        }
    }, true);

    // 3. Capture Text Typing / Captions
    document.addEventListener('input', (e) => {
        const target = e.target.closest('textarea, div[role="textbox"], input[type="text"], [contenteditable="true"]') || e.target;
        if (!target) return;

        const isTextInput = target.matches && target.matches('textarea, div[role="textbox"], input[type="text"], [contenteditable="true"]');
        if (isTextInput && !target.dataset.__typingRecorded) {
            target.dataset.__typingRecorded = 'true';
            sendStep({
                type: 'type',
                description: 'Type caption text',
                variable: 'content',
                selectors: getElementSelectors(target),
                timestamp: Date.now()
            });
        }
    }, true);

    // Inject badge when body is ready
    const injectBadge = () => {
        if (!document.body || document.getElementById('__gc_recorder_badge')) return;
        const badge = document.createElement('div');
        badge.id = '__gc_recorder_badge';
        badge.innerHTML = '🔴 <b>Recording Live...</b> (Perform your post flow, then press Enter in terminal)';
        Object.assign(badge.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: '999999',
            background: '#0E3A75',
            color: '#FFFFFF',
            padding: '10px 16px',
            borderRadius: '14px',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none'
        });
        document.body.appendChild(badge);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectBadge);
    } else {
        injectBadge();
    }
})();
"""


async def run_recorder(platform: str):
    db = session_factory()
    try:
        account = db.query(ConnectedAccount).filter(ConnectedAccount.platform == platform).first()
        if not account:
            print(f"❌ No connected account found for platform '{platform}'. Please connect one first.")
            return

        session_mgr = BrowserSessionManager()
        session_dir = session_mgr.get_account_session_dir(account.id)
        storage_state_path = session_mgr.get_storage_state_path(account.id)
        target_url = "https://www.instagram.com/" if platform == "instagram" else "https://x.com/home"

        print("\n=======================================================")
        print(f"🚀 LAUNCHING RECORDER FOR @{account.handle} ({platform.upper()})")
        print("=======================================================")
        print("1. Chrome will open in HEADED mode.")
        print("2. Perform your normal flow: Create -> Select Image -> Next -> Next -> Caption -> Share.")
        print("3. Watch this terminal confirm each step live with 🟢 [CAPTURED].")
        print("4. Press ENTER here when finished.\n")

        cleaned_steps: list[dict[str, Any]] = []
        last_click_desc: str | None = None
        last_click_time: float = 0.0

        async def handle_browser_step(raw_json: str):
            nonlocal last_click_desc, last_click_time
            try:
                step = json.loads(raw_json)
                stype = step.get("type", "")
                desc = step.get("description", "")
                selectors = step.get("selectors", [])
                now = step.get("timestamp", 0) / 1000.0

                # 1. Debounce only rapid accidental double-clicks (<1.0s on the EXACT same element)
                # Consecutive wizard steps (e.g. Next -> Next) are now properly preserved!
                if stype == "click":
                    if desc == last_click_desc and (now - last_click_time) < 1.0:
                        return
                    last_click_desc = desc
                    last_click_time = now

                # 2. Automatically absorb redundant "Select from computer" click into the upload step
                # This prevents the OS file picker window from ever spawning during automated playback!
                if stype == "upload" and cleaned_steps:
                    prev_desc = cleaned_steps[-1].get("description", "").lower()
                    if "select from computer" in prev_desc or "upload" in prev_desc:
                        cleaned_steps.pop()
                        print("  🔄 [OPTIMIZED] Absorbed button click into clean background file upload")

                # 3. Auto-flag post-publish dismiss buttons as optional
                if "done" in desc.lower() or "close" in desc.lower():
                    step["optional"] = True

                cleaned_steps.append({
                    "type": stype,
                    "description": desc,
                    "selectors": selectors,
                    "target": step.get("target"),
                    "variable": step.get("variable"),
                    **({"optional": True} if step.get("optional") else {}),
                })
                print(f"  🟢 [CAPTURED] {stype.upper()}: {desc}")

            except Exception as e:
                logger.debug("Step processing error: %s", e)

        async with async_playwright() as playwright:
            context = await create_stealth_context(
                playwright=playwright,
                user_data_dir=session_dir,
                headless=False,
                storage_state_path=storage_state_path if storage_state_path.exists() else None,
            )

            await context.expose_function("__gc_record_step", handle_browser_step)
            await context.add_init_script(RECORDER_INJECTION_JS)

            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(target_url, wait_until="domcontentloaded")

            await asyncio.to_thread(input, "\n👉 When you have finished the entire posting flow, press [ENTER] here to save: ")

            await session_mgr.save_session_state(context, account.id)

            if not cleaned_steps:
                print("\n⚠️ Warning: No steps were recorded. Existing recipe was NOT overwritten.")
            else:
                recipes_dir = Path("storage/recipes")
                recipes_dir.mkdir(parents=True, exist_ok=True)
                output_file = recipes_dir / f"{platform}_publish.json"
                output_file.write_text(json.dumps(cleaned_steps, indent=2), encoding="utf-8")

                print("\n=======================================================")
                print(f"✅ SUCCESS: Automatically extracted {len(cleaned_steps)} action steps!")
                print(f"💾 Recipe saved to: {output_file.resolve()}")
                print(f"🍪 Session cookies saved to: {storage_state_path.resolve()}")
                print("=======================================================\n")

            await context.close()
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Record a social media workflow action")
    parser.add_argument("--platform", default="instagram", help="Platform name (instagram, twitter)")
    args = parser.parse_args()
    asyncio.run(run_recorder(args.platform))
