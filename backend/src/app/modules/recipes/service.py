import logging
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import PlatformType
from app.modules.recipes.commands import CreateRecipeCommand, UpdateRecipeCommand
from app.modules.recipes.exceptions import (
    RecipeAlreadyExistsError,
    RecipeNotFoundError,
)
from app.modules.recipes.models import ActionRecipe

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
