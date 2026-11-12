import asyncio
import logging
from typing import Any

from playwright.async_api import Page

from app.platforms.browser.human_behavior import human_type, random_delay

logger = logging.getLogger(__name__)


class RecipeExecutionError(Exception):
    """Raised when an action in the recorded recipe fails all selector fallbacks."""


class ActionRecipeRunner:
    """
    Executes a saved action sequence dynamically against an active Playwright page.
    Automatically handles variable substitution (content, media) and selector fallbacks.
    """

    def __init__(self, page: Page, timeout_ms: int = 15000):
        self.page = page
        self.timeout_ms = timeout_ms

    async def _resolve_element(self, selectors: list[str]):
        """Tries selectors in order until one is visible in the DOM."""
        # 1. Quick check if any selector is already rendered
        for selector in selectors:
            try:
                locator = self.page.locator(selector).first
                if await locator.is_visible():
                    return locator
            except Exception:
                continue

        # 2. If animating or opening a modal, wait up to 4s for each selector
        if selectors:
            for sel in selectors:
                try:
                    locator = self.page.locator(sel).first
                    await locator.wait_for(state="visible", timeout=4000)
                    return locator
                except Exception:
                    continue
        return None

    async def execute_recipe(
        self,
        steps: list[dict[str, Any]],
        variables: dict[str, Any],
    ) -> bool:
        """
        Executes each recorded step in the recipe.
        Variables map keys like 'content' and 'media_path' to runtime values.
        """
        for index, step in enumerate(steps, start=1):
            action_type = step.get("type")
            description = step.get("description", f"Step {index}")
            selectors = step.get("selectors", [])
            optional = step.get("optional", False)

            logger.info("Executing [%s]: %s", action_type, description)

            # 1. FILE UPLOAD STEP
            if action_type == "upload":
                target_selector = step.get("target", "input[type='file']")
                file_path = variables.get(step.get("variable", "media_path"))
                if not file_path:
                    raise RecipeExecutionError(
                        f"Upload step missing variable '{step.get('variable')}'"
                    )

                from app.platforms.media_utils import resolve_media_path

                resolved_file = resolve_media_path(str(file_path))
                file_input = self.page.locator(target_selector).first

                # Check if input is rendered or needs clicking a trigger button
                if await file_input.count() > 0:
                    await file_input.set_input_files(str(resolved_file))
                else:
                    trigger_btn = await self._resolve_element(selectors)
                    if trigger_btn:
                        async with self.page.expect_file_chooser(timeout=10000) as fc_info:
                            await trigger_btn.click()
                        file_chooser = await fc_info.value
                        await file_chooser.set_files(str(resolved_file))
                    else:
                        raise RecipeExecutionError(
                            f"Could not find upload input for: {description}"
                        )

                await random_delay(2.5, 4.0)
                continue

            # 2. CLICK STEP
            if action_type == "click":
                element = await self._resolve_element(selectors)
                if element is None:
                    if optional:
                        logger.debug("Optional step skipped: %s", description)
                        continue
                    raise RecipeExecutionError(f"Could not locate element for: {description}")

                await element.click()
                await random_delay(1.5, 2.5)
                continue

            # 3. TEXT TYPE STEP
            if action_type == "type":
                element = await self._resolve_element(selectors)
                if element is None:
                    raise RecipeExecutionError(f"Could not locate text field for: {description}")

                text_to_type = variables.get(step.get("variable", "content"), "")
                await element.click()
                await random_delay(0.5, 1.0)
                await human_type(self.page, element, text_to_type)
                await random_delay(1.0, 2.0)
                continue

            # 4. SLEEP / WAIT STEP
            if action_type == "wait":
                seconds = step.get("seconds", 2.0)
                await asyncio.sleep(seconds)
                continue

        logger.info("Action recipe executed successfully.")
        return True
