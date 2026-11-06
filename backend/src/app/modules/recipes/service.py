import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import WebSocket
from playwright.async_api import async_playwright
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import PlatformType
from app.modules.accounts.models import ConnectedAccount
from app.modules.recipes.commands import CreateRecipeCommand, UpdateRecipeCommand
from app.modules.recipes.exceptions import (
    RecipeAlreadyExistsError,
    RecipeNotFoundError,
)
from app.modules.recipes.models import ActionRecipe
from app.platforms.browser.driver import create_stealth_context
from app.platforms.browser.recorder import RECORDER_INJECTION_JS
from app.platforms.browser.session_manager import BrowserSessionManager

logger = logging.getLogger(__name__)

PLATFORM_HOME_URLS: dict[str, str] = {
    "instagram": "https://www.instagram.com/",
    "twitter": "https://x.com/home",
    "facebook": "https://www.facebook.com/",
    "email": "https://mail.google.com/",
}


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class RecipeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ================= Query & CRUD Methods =================

    async def get_recipe_by_id(self, recipe_id: UUID | str) -> ActionRecipe | None:
        target_id = _ensure_uuid(recipe_id)
        stmt = select(ActionRecipe).where(ActionRecipe.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_recipe_by_id_or_raise(self, recipe_id: UUID | str) -> ActionRecipe:
        recipe = await self.get_recipe_by_id(recipe_id)
        if not recipe:
            raise RecipeNotFoundError(recipe_id)
        return recipe

    async def get_default_recipe(self, platform: PlatformType) -> ActionRecipe | None:
        stmt = select(ActionRecipe).where(
            ActionRecipe.platform == platform,
            ActionRecipe.is_default.is_(True),
            ActionRecipe.is_active.is_(True),
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_recipes(
        self,
        platform: PlatformType | None = None,
        active_only: bool = False,
    ) -> list[ActionRecipe]:
        stmt = select(ActionRecipe).order_by(ActionRecipe.created_at.desc())
        if platform is not None:
            stmt = stmt.where(ActionRecipe.platform == platform)
        if active_only:
            stmt = stmt.where(ActionRecipe.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_recipe(self, cmd: CreateRecipeCommand) -> ActionRecipe:
        clean_name = cmd.name.strip()
        stmt = select(ActionRecipe).where(
            ActionRecipe.platform == cmd.platform,
            ActionRecipe.name == clean_name,
        )
        res = await self.db.execute(stmt)
        if res.scalars().first():
            platform_str = cmd.platform.value if hasattr(cmd.platform, "value") else str(cmd.platform)
            raise RecipeAlreadyExistsError(platform=platform_str, name=clean_name)

        if cmd.is_default:
            await self._unset_default(cmd.platform)

        recipe = ActionRecipe(
            name=clean_name,
            platform=cmd.platform,
            description=cmd.description,
            steps=cmd.steps,
            is_default=cmd.is_default,
            is_active=cmd.is_active,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(recipe)
        await self.db.commit()
        await self.db.refresh(recipe)
        return recipe

    async def update_recipe(self, cmd: UpdateRecipeCommand) -> ActionRecipe:
        recipe = await self.get_recipe_by_id_or_raise(cmd.recipe_id)

        if cmd.name is not None:
            clean_name = cmd.name.strip()
            if clean_name != recipe.name:
                stmt = select(ActionRecipe).where(
                    ActionRecipe.platform == recipe.platform,
                    ActionRecipe.name == clean_name,
                    ActionRecipe.id != recipe.id,
                )
                res = await self.db.execute(stmt)
                if res.scalars().first():
                    platform_str = recipe.platform.value if hasattr(recipe.platform, "value") else str(recipe.platform)
                    raise RecipeAlreadyExistsError(platform=platform_str, name=clean_name)
                recipe.name = clean_name

        if cmd.description is not None:
            recipe.description = cmd.description
        if cmd.steps is not None:
            recipe.steps = cmd.steps
        if cmd.is_active is not None:
            recipe.is_active = cmd.is_active

        if cmd.is_default is not None:
            if cmd.is_default and not recipe.is_default:
                await self._unset_default(recipe.platform)
            recipe.is_default = cmd.is_default

        if cmd.extra_metadata is not None:
            recipe.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(recipe)
        return recipe

    async def delete_recipe(self, recipe_id: UUID | str) -> None:
        recipe = await self.get_recipe_by_id_or_raise(recipe_id)
        await self.db.delete(recipe)
        await self.db.commit()

    async def _unset_default(self, platform: PlatformType) -> None:
        await self.db.execute(
            update(ActionRecipe)
            .where(
                ActionRecipe.platform == platform,
                ActionRecipe.is_default.is_(True),
            )
            .values(is_default=False)
        )

    # ================= Live Browser Recorder Stream =================

    async def run_recipe_recorder_stream(
        self,
        platform: str,
        websocket: WebSocket,
    ) -> None:
        try:
            p_enum = PlatformType(platform.lower())
            stmt = select(ConnectedAccount).where(ConnectedAccount.platform == p_enum)
            res = await self.db.execute(stmt)
            account = res.scalars().first()
        except ValueError:
            account = None

        session_mgr = BrowserSessionManager()
        user_data_dir = session_mgr.get_account_session_dir(account.id if account else "guest")
        storage_state = session_mgr.get_storage_state_path(account.id) if account else None

        await websocket.send_json({"type": "status", "message": "Launching Stealth Chromium..."})

        async with async_playwright() as playwright:
            context = await create_stealth_context(
                playwright=playwright,
                user_data_dir=user_data_dir,
                headless=True,
                storage_state_path=storage_state if (storage_state and storage_state.exists()) else None,
            )

            page = context.pages[0] if context.pages else await context.new_page()
            await page.set_viewport_size({"width": 1280, "height": 800})

            last_click_desc: str | None = None
            last_click_time: float = 0.0

            async def on_step_captured(raw_json: str):
                nonlocal last_click_desc, last_click_time
                try:
                    step_dict = json.loads(raw_json)
                    stype = step_dict.get("type", "")
                    desc = step_dict.get("description", "")
                    now = step_dict.get("timestamp", 0) / 1000.0

                    if stype == "click":
                        if desc == last_click_desc and (now - last_click_time) < 1.2:
                            return
                        last_click_desc = desc
                        last_click_time = now

                    await websocket.send_json({"type": "step", "step": step_dict})
                except Exception as exc:
                    logger.debug("Step capture send error: %s", exc)

            await context.expose_function("__gc_record_step", on_step_captured)
            await context.add_init_script(RECORDER_INJECTION_JS)

            active_file_chooser: Any = None

            def on_file_chooser(file_chooser):
                nonlocal active_file_chooser
                active_file_chooser = file_chooser
                asyncio.create_task(websocket.send_json({"type": "file_chooser"}))

            page.on("filechooser", on_file_chooser)

            cdp = await context.new_cdp_session(page)

            def on_screencast_frame(event: dict[str, Any]):
                async def _send_frame():
                    try:
                        data = event.get("data")
                        session_id = event.get("sessionId")
                        await websocket.send_json({"type": "frame", "data": data})
                        await cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
                    except Exception:
                        pass

                asyncio.create_task(_send_frame())

            cdp.on("Page.screencastFrame", on_screencast_frame)
            await cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": 75,
                    "maxWidth": 1280,
                    "maxHeight": 800,
                    "everyNthFrame": 1,
                },
            )

            target_url = PLATFORM_HOME_URLS.get(platform.lower(), f"https://www.{platform}.com/")
            await websocket.send_json({"type": "status", "message": f"Loading {target_url}..."})
            await page.goto(target_url, wait_until="domcontentloaded")
            await websocket.send_json({"type": "navigated", "url": page.url})
            await websocket.send_json({"type": "status", "message": "Ready"})

            page.on(
                "framenavigated",
                lambda frame: asyncio.create_task(
                    websocket.send_json({"type": "navigated", "url": page.url})
                )
                if frame == page.main_frame
                else None,
            )

            try:
                while True:
                    msg = await websocket.receive_json()
                    m_type = msg.get("type")

                    if m_type == "click":
                        await page.mouse.click(int(msg.get("x", 0)), int(msg.get("y", 0)))
                    elif m_type == "type":
                        await page.keyboard.insert_text(msg.get("text", ""))
                    elif m_type == "key":
                        await page.keyboard.press(msg.get("key", "Enter"))
                    elif m_type == "navigate":
                        nav_url = msg.get("url")
                        if nav_url:
                            if not nav_url.startswith(("http://", "https://")):
                                nav_url = f"https://{nav_url}"
                            await page.goto(nav_url, wait_until="domcontentloaded")
                            await websocket.send_json({"type": "navigated", "url": page.url})
                    elif m_type == "upload_file":
                        b64_data = msg.get("data", "")
                        filename = msg.get("filename", "upload.png")

                        media_dir = Path("storage/media").resolve()
                        media_dir.mkdir(parents=True, exist_ok=True)
                        saved_path = media_dir / f"live_{filename}"
                        saved_path.write_bytes(base64.b64decode(b64_data))

                        if active_file_chooser:
                            await active_file_chooser.set_files(str(saved_path))
                            active_file_chooser = None
                        else:
                            file_input = page.locator("input[type='file']").first
                            if await file_input.count() > 0:
                                await file_input.set_input_files(str(saved_path))
            finally:
                if account:
                    await session_mgr.save_session_state(context, account.id)
                await context.close()
