import logging
from pathlib import Path
from typing import Any

from playwright.async_api import (
    BrowserContext,
    Page,
    Playwright,
)

logger = logging.getLogger(__name__)

# Modern Chrome desktop user-agent
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

# Common Chrome command line arguments to strip automation fingerprints
BASE_STEALTH_ARGS: list[str] = [
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
    "--no-default-browser-check",
    "--no-first-run",
]

STEALTH_INIT_SCRIPT = """
(() => {
    // 1. Mask navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });

    // 2. Spoof Chrome runtime object
    window.chrome = {
        app: { isInstalled: false },
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({})
    };

    // 3. Spoof Plugins list
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
        configurable: true
    });

    // 4. Spoof Languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true
    });

    // 5. Mock Permissions API query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
    );
})();
"""


def _clean_stale_profile_locks(user_data_path: Path) -> None:
    """
    Removes orphaned Chromium singleton lock files left by abruptly closed
    browser sessions to prevent exit code 21 (RESULT_CODE_PROFILE_IN_USE).
    """
    lock_names = ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]
    for name in lock_names:
        lock_file = user_data_path / name
        try:
            if lock_file.is_symlink() or lock_file.exists():
                lock_file.unlink(missing_ok=True)
                logger.debug("Cleaned stale profile lock: %s", lock_file)
        except OSError:
            pass


async def apply_stealth_to_page(page: Page) -> None:
    """Applies client-side evasions to a single page."""
    await page.add_init_script(STEALTH_INIT_SCRIPT)
    try:
        await page.evaluate(STEALTH_INIT_SCRIPT)
    except Exception:
        pass


async def create_stealth_context(
    playwright: Playwright,
    user_data_dir: Path | str,
    headless: bool = True,
    storage_state_path: Path | str | None = None,
    **kwargs: Any,
) -> BrowserContext:
    """
    Creates a persistent Chrome browser context hardened against bot detection.
    Persists cookies, indexedDB, and local storage inside user_data_dir.
    """
    import json

    user_data_path = Path(user_data_dir).resolve()
    user_data_path.mkdir(parents=True, exist_ok=True)

    # 1. Clean stale singleton locks to avoid exit code 21
    _clean_stale_profile_locks(user_data_path)

    # Remove storage_state if passed in kwargs since launch_persistent_context does not accept it
    kwargs.pop("storage_state", None)

    # 2. Configure arguments based on headless vs headed mode
    launch_args = list(BASE_STEALTH_ARGS)
    if not headless:
        launch_args.append("--start-maximized")

    context_kwargs: dict[str, Any] = {
        "user_data_dir": str(user_data_path),
        "channel": "chromium",
        "headless": headless,
        "args": launch_args,
        "user_agent": DEFAULT_USER_AGENT,
        "viewport": None if not headless else {"width": 1280, "height": 800},
        "no_viewport": not headless,
        "ignore_https_errors": True,
        **kwargs,
    }

    logger.debug("Launching stealth persistent context at %s (headless=%s)", user_data_path, headless)
    context = await playwright.chromium.launch_persistent_context(**context_kwargs)

    # Restore cookies from storage_state.json if present
    if storage_state_path and Path(storage_state_path).exists():
        try:
            state_data = json.loads(Path(storage_state_path).read_text(encoding="utf-8"))
            if cookies := state_data.get("cookies"):
                await context.add_cookies(cookies)
        except Exception as exc:
            logger.warning("Could not restore cookies from %s: %s", storage_state_path, exc)

    # Automatically apply stealth script to all current and future tabs/pages
    await context.add_init_script(STEALTH_INIT_SCRIPT)
    for existing_page in context.pages:
        await apply_stealth_to_page(existing_page)

    return context
