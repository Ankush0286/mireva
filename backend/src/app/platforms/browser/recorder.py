"""
Interactive Multi-Action Workflow Recorder CLI:
  Interactive TUI: uv run python src/app/platforms/browser/recorder.py
  Direct Flags:    uv run python src/app/platforms/browser/recorder.py --platform instagram --action send_dm
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Ensure `src` is on sys.path even when invoked directly
_SRC_DIR = str(Path(__file__).resolve().parents[3])
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from playwright.async_api import async_playwright  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.common.enums import PlatformType  # noqa: E402
from app.db.session import async_session_factory, sync_replica  # noqa: E402
from app.modules.accounts.models import ConnectedAccount  # noqa: E402
from app.modules.recipes.models import ActionRecipe  # noqa: E402
from app.platforms.browser.driver import create_stealth_context  # noqa: E402
from app.platforms.browser.session_manager import BrowserSessionManager  # noqa: E402

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# =============================================================================
# ANSI Terminal Styling Helpers
# =============================================================================

RESET = "\x1b[0m"
BOLD = "\x1b[1m"
DIM = "\x1b[2m"
CYAN = "\x1b[36m"
GREEN = "\x1b[32m"
YELLOW = "\x1b[33m"
BLUE = "\x1b[34m"
MAGENTA = "\x1b[35m"

# Only track deterministic WRITE actions as recipes; read/exploration is handled by the Browser AI Agent
ACTION_DEFINITIONS: dict[str, dict[str, str]] = {
    "publish_post": {
        "name": "Default Feed Post",
        "label": "Publish Post",
        "guide": "Click Create -> Upload Media -> Next (Crop/Filter) -> Type Caption -> Click Share",
    },
    "send_dm": {
        "name": "Default Cold DM",
        "label": "Send Cold DM",
        "guide": "Open profile via top URL bar -> Click 'Message' -> Focus chatbox -> Type text -> Click Send",
    },
    "comment_reply": {
        "name": "Default Comment Auto-Reply",
        "label": "Reply to Post",
        "guide": "Open post URL via top URL bar -> Click Comment/Reply box -> Type reply -> Click Post",
    },
}

PLATFORM_URLS: dict[str, dict[str, str]] = {
    "instagram": {
        "default": "https://www.instagram.com/",
    },
    "twitter": {
        "default": "https://x.com/home",
    },
    "facebook": {
        "default": "https://www.facebook.com/",
    },
}

# =============================================================================
# Browser DOM Recorder Injection Script (Exported for RecipeService WebSockets)
# =============================================================================

RECORDER_INJECTION_JS = """
(() => {
    if (window.__gc_recorder_initialized) return;
    window.__gc_recorder_initialized = true;
    window.__gc_step_count = 0;

    const isEditableElement = (el) => {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute ? el.getAttribute('role') : '';
        const ce = el.getAttribute ? el.getAttribute('contenteditable') : '';
        return tag === 'input' || tag === 'textarea' || role === 'textbox' || ce === 'true';
    };

    const getElementSelectors = (el) => {
        const selectors = [];
        if (!el || !el.getAttribute) return selectors;

        const addUnique = (sel) => {
            if (sel && !selectors.includes(sel)) selectors.push(sel);
        };

        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const role = el.getAttribute('role');
        const nameAttr = el.getAttribute('name');
        const placeholder = el.getAttribute('placeholder');
        const isEditable = isEditableElement(el);

        const innerAriaEl = el.querySelector ? el.querySelector('[aria-label]') : null;
        const rawAria = el.getAttribute('aria-label') || (innerAriaEl ? innerAriaEl.getAttribute('aria-label') : null);
        const ariaLabel = (rawAria && !/\\b(ago|seconds|minutes|hours|days|weeks)\\b/i.test(rawAria)) ? rawAria : null;

        const innerTestEl = el.querySelector ? el.querySelector('[data-testid]') : null;
        const testId = el.getAttribute('data-testid') || (innerTestEl ? innerTestEl.getAttribute('data-testid') : null);

        const rawText = (el.innerText || el.textContent || '').trim();
        const cleanText = rawText.length < 30 ? rawText.replace(/"/g, '\\\\"') : '';

        const inDialog = Boolean(el.closest('[role="dialog"]'));
        const inHeader = Boolean(el.closest('header'));
        const prefix = inDialog ? '[role="dialog"] ' : (inHeader ? 'header ' : '');

        if (ariaLabel) {
            if (prefix) addUnique(`${prefix}[aria-label="${ariaLabel}"]`);
            addUnique(`[aria-label="${ariaLabel}"]`);
        }
        if (testId) {
            if (prefix) addUnique(`${prefix}[data-testid="${testId}"]`);
            addUnique(`[data-testid="${testId}"]`);
        }
        if (nameAttr) {
            addUnique(`${tag}[name="${nameAttr}"]`);
        }
        if (placeholder && placeholder.length < 45) {
            const cleanPh = placeholder.replace(/"/g, '\\\\"');
            addUnique(`${tag}[placeholder="${cleanPh}"]`);
            addUnique(`[placeholder="${cleanPh}"]`);
        }

        if (isEditable) {
            // NEVER use :has-text() on editable inputs/textboxes (avoids capturing typed letters)
            if (role === 'textbox' || el.getAttribute('contenteditable') === 'true') {
                if (prefix) addUnique(`${prefix}div[role="textbox"][contenteditable="true"]`);
                addUnique('div[role="textbox"][contenteditable="true"]');
                if (prefix) addUnique(`${prefix}[role="textbox"]`);
                addUnique('[role="textbox"]');
            }
            if (tag === 'textarea') {
                if (prefix) addUnique(`${prefix}textarea`);
                addUnique('textarea');
            }
        } else {
            if (role && cleanText && role !== 'img' && role !== 'presentation') {
                if (prefix) addUnique(`${prefix}[role="${role}"]:has-text("${cleanText}")`);
                addUnique(`[role="${role}"]:has-text("${cleanText}")`);
            }
            if (cleanText && ['button', 'a', 'span', 'div'].includes(tag)) {
                if (prefix) addUnique(`${prefix}${tag}:has-text("${cleanText}")`);
                if (tag === 'button' || tag === 'a') {
                    addUnique(`${tag}:has-text("${cleanText}")`);
                } else {
                    addUnique(`button:has-text("${cleanText}")`);
                    addUnique(`div[role="button"]:has-text("${cleanText}")`);
                }
            }
        }

        if (el.id && !/^[0-9]+$/.test(el.id)) {
            addUnique(`#${el.id}`);
        }
        return selectors;
    };

    const updateBadge = (lastAction) => {
        const badge = document.getElementById('__gc_recorder_badge');
        if (!badge) return;
        window.__gc_step_count += 1;
        badge.innerHTML = `🔴 <b>GrowthCraft Recorder</b> • <b>${window.__gc_step_count} steps</b><br/><span style="font-size:11px;opacity:0.85">Last: ${lastAction}</span>`;
    };

    const sendStep = (step) => {
        if (window.__gc_record_step) {
            updateBadge(`${step.type.toUpperCase()}: ${step.description}`);
            window.__gc_record_step(JSON.stringify(step));
        }
    };

    // 1. Capture Clicks on interactive elements
    document.addEventListener('click', (e) => {
        const buttonTarget = e.target.closest('button, a, div[role="button"], [role="menuitem"], [role="tab"], [role="textbox"], [contenteditable="true"], textarea, input');
        const ariaTarget = e.target.closest('svg[aria-label], [aria-label], [data-testid]');
        const target = buttonTarget || ariaTarget;
        if (!target) return;

        const isEditable = isEditableElement(target);
        const text = !isEditable ? (target.innerText || target.textContent || '').trim() : '';
        const innerAria = target.querySelector ? target.querySelector('[aria-label]') : null;
        const aria = target.getAttribute('aria-label') || (innerAria ? innerAria.getAttribute('aria-label') : '');
        const testId = target.getAttribute('data-testid') || '';
        const desc = aria || testId || (text ? text.slice(0, 28) : (isEditable ? 'textbox' : target.tagName.toLowerCase()));

        sendStep({
            type: 'click',
            description: `Click "${desc}"`,
            is_editable_target: isEditable,
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

    // 3. Capture Text Typing
    document.addEventListener('input', (e) => {
        const target = e.target.closest('textarea, div[role="textbox"], input[type="text"], [contenteditable="true"]') || e.target;
        if (!target) return;

        if (isEditableElement(target) && !target.dataset.__typingRecorded) {
            target.dataset.__typingRecorded = 'true';
            sendStep({
                type: 'type',
                description: 'Type dynamic content',
                variable: 'content',
                selectors: getElementSelectors(target),
                timestamp: Date.now()
            });
        }
    }, true);

    const injectBadge = () => {
        if (!document.body || document.getElementById('__gc_recorder_badge')) return;
        const badge = document.createElement('div');
        badge.id = '__gc_recorder_badge';
        badge.innerHTML = '🔴 <b>GrowthCraft Recorder Active</b><br/><span style="font-size:11px;opacity:0.85">Perform workflow, then press Enter in terminal</span>';
        Object.assign(badge.style, {
            position: 'fixed',
            top: '14px',
            right: '14px',
            zIndex: '999999',
            background: '#0E3A75',
            color: '#FFFFFF',
            padding: '10px 16px',
            borderRadius: '14px',
            fontSize: '12px',
            lineHeight: '1.4',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 10px 28px rgba(9,18,42,0.35)',
            border: '1px solid rgba(255,255,255,0.22)',
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


# =============================================================================
# Terminal UI & Database Persistence Helpers (Asynchronous)
# =============================================================================


def _print_banner() -> None:
    print(f"\n{BLUE}{BOLD}╔══════════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BLUE}{BOLD}║{RESET}  {CYAN}{BOLD}⚡ GrowthCraft Multi-Action Browser Recipe Recorder Studio{RESET}          {BLUE}{BOLD}║{RESET}")
    print(f"{BLUE}{BOLD}╚══════════════════════════════════════════════════════════════════════╝{RESET}")


async def _print_coverage_table(db: AsyncSession) -> None:
    stmt = select(ActionRecipe).where(ActionRecipe.is_active.is_(True))
    result = await db.execute(stmt)
    recipes = list(result.scalars().all())
    recipes_dir = Path("storage/recipes").resolve()

    print(f"\n{BOLD}  Current Write Recipe Coverage (Read/Explore handled by AI Agent):{RESET}")
    header = f"  {'PLATFORM':<13} │ " + " │ ".join(
        f"{meta['label']:<18}" for meta in ACTION_DEFINITIONS.values()
    )
    print(f"{DIM}  {'─' * (len(header) - 2)}{RESET}")
    print(f"{BOLD}{header}{RESET}")
    print(f"{DIM}  {'─' * (len(header) - 2)}{RESET}")

    for platform in ("instagram", "twitter", "facebook"):
        cells: list[str] = []
        p_enum = PlatformType(platform)
        p_recipes = [r for r in recipes if r.platform == p_enum]

        for action_key in ACTION_DEFINITIONS:
            has_db = any(
                (r.extra_metadata or {}).get("action_type") == action_key
                or (action_key == "publish_post" and r.is_default)
                for r in p_recipes
            )
            has_disk = (recipes_dir / f"{platform}_{action_key}.json").exists() or (
                action_key == "publish_post" and (recipes_dir / f"{platform}_publish.json").exists()
            )
            if has_db or has_disk:
                cells.append(f"{GREEN}{'✓ Ready':<18}{RESET}")
            else:
                cells.append(f"{YELLOW}{'○ Missing':<18}{RESET}")

        row_str = f"  {platform.capitalize():<13} │ " + " │ ".join(cells)
        print(row_str)
    print(f"{DIM}  {'─' * (len(header) - 2)}{RESET}\n")


async def _upsert_recipe_to_db(
    db: AsyncSession,
    platform: str,
    action_type: str,
    steps: list[dict[str, Any]],
) -> ActionRecipe:
    """Saves or updates the recorded default recipe inside the database asynchronously."""
    p_enum = PlatformType(platform.lower())
    action_meta = ACTION_DEFINITIONS.get(action_type, ACTION_DEFINITIONS["publish_post"])
    recipe_name = f"{platform.capitalize()} {action_meta['name']}"
    is_post_default = action_type == "publish_post"

    stmt = select(ActionRecipe).where(ActionRecipe.platform == p_enum)
    result = await db.execute(stmt)
    existing_recipes = list(result.scalars().all())

    target_recipe: ActionRecipe | None = None
    for r in existing_recipes:
        if (r.extra_metadata or {}).get("action_type") == action_type or r.name == recipe_name:
            target_recipe = r
            break

    if is_post_default:
        await db.execute(
            update(ActionRecipe)
            .where(
                ActionRecipe.platform == p_enum,
                ActionRecipe.is_default.is_(True),
            )
            .values(is_default=False)
        )

    now_iso = datetime.now(UTC).isoformat()

    if target_recipe:
        target_recipe.name = recipe_name
        target_recipe.description = f"Recorded via CLI ({action_meta['label']})"
        target_recipe.steps = steps
        target_recipe.is_default = is_post_default
        target_recipe.is_active = True
        target_recipe.extra_metadata = {
            **(target_recipe.extra_metadata or {}),
            "action_type": action_type,
            "recorded_via": "cli",
            "recorded_at": now_iso,
        }
        await db.commit()
        await db.refresh(target_recipe)
        return target_recipe

    new_recipe = ActionRecipe(
        name=recipe_name,
        platform=p_enum,
        description=f"Recorded via CLI ({action_meta['label']})",
        steps=steps,
        is_default=is_post_default,
        is_active=True,
        extra_metadata={
            "action_type": action_type,
            "recorded_via": "cli",
            "recorded_at": now_iso,
        },
    )
    db.add(new_recipe)
    await db.commit()
    await db.refresh(new_recipe)
    return new_recipe


async def sync_all_disk_recipes_to_db(db: AsyncSession) -> int:
    """Scans storage/recipes/*.json and syncs local JSON files into the database."""
    recipes_dir = Path("storage/recipes").resolve()
    if not recipes_dir.exists():
        print(f"{YELLOW}No storage/recipes directory found.{RESET}")
        return 0

    synced = 0
    for file_path in recipes_dir.glob("*.json"):
        stem = file_path.stem.lower()
        parts = stem.split("_", 1)
        if len(parts) != 2:
            continue
        platform_str, action_str = parts
        if platform_str not in ("instagram", "twitter", "facebook"):
            continue
        if action_str == "publish":
            action_str = "publish_post"
        if action_str not in ACTION_DEFINITIONS:
            continue

        try:
            steps = json.loads(file_path.read_text(encoding="utf-8"))
            if isinstance(steps, list) and steps:
                await _upsert_recipe_to_db(db, platform_str, action_str, steps)
                synced += 1
                print(f"  {GREEN}✓ Synced{RESET} {file_path.name} -> DB ({platform_str} / {action_str})")
        except Exception as exc:
            print(f"  {YELLOW}⚠️ Failed to sync {file_path.name}: {exc}{RESET}")

    try:
        await sync_replica()
    except Exception:
        pass
    return synced


async def record_single_workflow(
    db: AsyncSession,
    platform: str,
    action_type: str,
    target_url_override: str | None = None,
) -> bool:
    """Launches headed stealth Chrome and records a specific platform workflow."""
    clean_platform = platform.lower().strip()
    clean_action = action_type.lower().strip()
    action_meta = ACTION_DEFINITIONS.get(clean_action, ACTION_DEFINITIONS["publish_post"])

    stmt = select(ConnectedAccount).where(ConnectedAccount.platform == PlatformType(clean_platform))
    result = await db.execute(stmt)
    account = result.scalars().first()

    session_mgr = BrowserSessionManager()
    profile_key = account.id if account else f"cli_{clean_platform}"
    session_dir = session_mgr.get_account_session_dir(profile_key)
    storage_state_path = session_mgr.get_storage_state_path(profile_key)

    platform_url_map = PLATFORM_URLS.get(clean_platform, PLATFORM_URLS["instagram"])
    target_url = target_url_override or platform_url_map["default"]
    handle_label = f"@{account.handle}" if account else "Guest Profile"

    print(f"\n{CYAN}{BOLD}┌──────────────────────────────────────────────────────────────────────┐{RESET}")
    print(f"{CYAN}{BOLD}│{RESET} 🎬 {BOLD}RECORDING:{RESET} {GREEN}{clean_platform.upper()} — {action_meta['label']}{RESET} ({handle_label})")
    print(f"{CYAN}{BOLD}├──────────────────────────────────────────────────────────────────────┤{RESET}")
    print(f"{CYAN}{BOLD}│{RESET} 📍 {BOLD}Starting URL:{RESET}   {target_url}")
    print(f"{CYAN}{BOLD}│{RESET} 📋 {BOLD}Workflow Guide:{RESET} {DIM}{action_meta['guide']}{RESET}")
    print(f"{CYAN}{BOLD}└──────────────────────────────────────────────────────────────────────┘{RESET}\n")

    cleaned_steps: list[dict[str, Any]] = []
    last_click_desc: str | None = None
    last_click_time: float = 0.0

    async def handle_browser_step(raw_json: str) -> None:
        nonlocal last_click_desc, last_click_time
        try:
            step = json.loads(raw_json)
            stype = step.get("type", "")
            desc = step.get("description", "")
            selectors: list[str] = step.get("selectors", [])
            is_editable_target = bool(step.get("is_editable_target", False))
            now = step.get("timestamp", 0) / 1000.0

            # 1. Debounce rapid accidental double-clicks (<1.0s on identical element)
            if stype == "click":
                if desc == last_click_desc and (now - last_click_time) < 1.0:
                    return
                last_click_desc = desc
                last_click_time = now

            # 2. Absorb redundant "Select from computer" button click into the upload step
            if stype == "upload" and cleaned_steps:
                prev_desc = cleaned_steps[-1].get("description", "").lower()
                if "select from computer" in prev_desc or "upload" in prev_desc:
                    cleaned_steps.pop()
                    print(f"  {MAGENTA}🔄 [OPTIMIZED]{RESET} Absorbed button click into background file upload")

            # 3. Absorb redundant focus click on a textbox immediately preceding a type step
            if stype == "type" and cleaned_steps:
                prev_step = cleaned_steps[-1]
                prev_desc = prev_step.get("description", "").lower()
                if prev_step.get("type") == "click" and (
                    prev_step.get("_is_editable")
                    or any(w in prev_desc for w in ("textbox", "message...", "caption", "comment", "reply"))
                ):
                    popped = cleaned_steps.pop()
                    for old_sel in popped.get("selectors", []):
                        if old_sel not in selectors and ":has-text(" not in old_sel:
                            selectors.append(old_sel)
                    print(f"  {MAGENTA}🔄 [OPTIMIZED]{RESET} Merged focus click into TYPE step")

            # 4. Auto-flag post-action close/dismiss buttons as optional
            if any(word in desc.lower() for word in ("done", "close", "not now")):
                step["optional"] = True

            cleaned_steps.append({
                "type": stype,
                "description": desc,
                "selectors": selectors,
                "target": step.get("target"),
                "variable": step.get("variable"),
                **({"optional": True} if step.get("optional") else {}),
                **({"_is_editable": True} if is_editable_target else {}),
            })

            step_num = len(cleaned_steps)
            sel_preview = selectors[0] if selectors else step.get("target", "N/A")
            print(
                f"  {GREEN}🟢 [STEP #{step_num:02d}]{RESET} "
                f"{BOLD}{stype.upper():<7}{RESET} │ {desc:<30} {DIM}({sel_preview}){RESET}"
            )
        except Exception as exc:
            logger.debug("Step processing error: %s", exc)

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

        await asyncio.to_thread(
            input,
            f"\n{YELLOW}{BOLD}👉 Perform the '{action_meta['label']}' flow in Chrome, then press [ENTER] here to save: {RESET}",
        )

        await session_mgr.save_session_state(context, profile_key)
        await context.close()

    # Strip internal helper flags before saving
    for s in cleaned_steps:
        s.pop("_is_editable", None)

    if not cleaned_steps:
        print(f"\n{YELLOW}⚠️  No steps were captured. Existing recipe was NOT overwritten.{RESET}\n")
        return False

    # 1. Save to Local Disk (storage/recipes/{platform}_{action}.json)
    recipes_dir = Path("storage/recipes")
    recipes_dir.mkdir(parents=True, exist_ok=True)
    disk_file = recipes_dir / f"{clean_platform}_{clean_action}.json"
    disk_file.write_text(json.dumps(cleaned_steps, indent=2), encoding="utf-8")

    if clean_action == "publish_post":
        legacy_file = recipes_dir / f"{clean_platform}_publish.json"
        legacy_file.write_text(json.dumps(cleaned_steps, indent=2), encoding="utf-8")

    # 2. Upsert into Database asynchronously
    saved_recipe = await _upsert_recipe_to_db(db, clean_platform, clean_action, cleaned_steps)
    try:
        await sync_replica()
    except Exception:
        pass

    print(f"\n{GREEN}{BOLD}╔══════════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{GREEN}{BOLD}║{RESET} ✅ {BOLD}SUCCESS:{RESET} Saved {len(cleaned_steps)} steps for {BOLD}{saved_recipe.name}{RESET}")
    print(f"{GREEN}{BOLD}╠══════════════════════════════════════════════════════════════════════╣{RESET}")
    print(f"{GREEN}{BOLD}║{RESET} 💾 {BOLD}Disk JSON:{RESET}  {disk_file.resolve()}")
    print(f"{GREEN}{BOLD}║{RESET} 🗄️  {BOLD}DB Record:{RESET}  {saved_recipe.id} (Action: {clean_action})")
    print(f"{GREEN}{BOLD}║{RESET} 🍪 {BOLD}Cookies:{RESET}    {storage_state_path.resolve()}")
    print(f"{GREEN}{BOLD}╚══════════════════════════════════════════════════════════════════════╝{RESET}\n")
    return True


async def run_interactive_cli(
    initial_platform: str | None = None,
    initial_action: str | None = None,
    target_url: str | None = None,
) -> None:
    async with async_session_factory() as db:
        _print_banner()
        await _print_coverage_table(db)

        if initial_platform and initial_action:
            await record_single_workflow(db, initial_platform, initial_action, target_url)
            return

        platforms = ["instagram", "twitter", "facebook"]
        if not initial_platform:
            print(f"{BOLD}Select Target Platform (or Sync):{RESET}")
            for idx, p_name in enumerate(platforms, start=1):
                print(f"  {CYAN}[{idx}]{RESET} {p_name.capitalize()}")
            print(f"  {MAGENTA}[S]{RESET} Sync all local storage/recipes/*.json files to Database")

            p_choice = (
                await asyncio.to_thread(
                    input,
                    f"\n{BOLD}Enter choice [1-3 or S] (default 1): {RESET}",
                )
            ).strip().upper() or "1"

            if p_choice == "S":
                count = await sync_all_disk_recipes_to_db(db)
                print(f"\n{GREEN}✅ Synced {count} disk recipes to database.{RESET}")
                await _print_coverage_table(db)
                return

            p_idx = max(0, min(len(platforms) - 1, int(p_choice) - 1)) if p_choice.isdigit() else 0
            selected_platform = platforms[p_idx]
        else:
            selected_platform = initial_platform.lower()

        action_keys = list(ACTION_DEFINITIONS.keys())
        if not initial_action:
            print(f"\n{BOLD}Select Workflow Action to Record for {selected_platform.capitalize()}:{RESET}")
            for idx, a_key in enumerate(action_keys, start=1):
                meta = ACTION_DEFINITIONS[a_key]
                print(f"  {CYAN}[{idx}]{RESET} {BOLD}{meta['label']:<24}{RESET} {DIM}({a_key}){RESET}")
            print(f"  {MAGENTA}[A]{RESET} {BOLD}Record All 3 Default Write Recipes Sequentially{RESET}")

            a_choice = (
                await asyncio.to_thread(
                    input,
                    f"\n{BOLD}Enter choice [1-{len(action_keys)} or A] (default 1): {RESET}",
                )
            ).strip().upper() or "1"

            if a_choice == "A":
                for a_key in action_keys:
                    await record_single_workflow(db, selected_platform, a_key, target_url)
                await _print_coverage_table(db)
                return

            a_idx = max(0, min(len(action_keys) - 1, int(a_choice) - 1)) if a_choice.isdigit() else 0
            selected_action = action_keys[a_idx]
        else:
            selected_action = initial_action.lower()

        await record_single_workflow(db, selected_platform, selected_action, target_url)
        await _print_coverage_table(db)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GrowthCraft Multi-Action Browser Workflow Recorder")
    parser.add_argument(
        "--platform",
        choices=["instagram", "twitter", "facebook"],
        default=None,
        help="Target social platform (omit for interactive menu)",
    )
    parser.add_argument(
        "--action",
        choices=list(ACTION_DEFINITIONS.keys()),
        default=None,
        help="Action workflow type to record (omit for interactive menu)",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Optional starting URL override",
    )
    args = parser.parse_args()
    asyncio.run(run_interactive_cli(args.platform, args.action, args.url))
