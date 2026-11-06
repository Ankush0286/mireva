from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import PlatformType
from app.modules.recipes.commands import CreateRecipeCommand, UpdateRecipeCommand
from app.modules.recipes.exceptions import (
    RecipeAlreadyExistsError,
    RecipeNotFoundError,
)
from app.modules.recipes.service import RecipeService


@pytest.mark.anyio
async def test_create_and_get_recipe(db_session: AsyncSession):
    service = RecipeService(db_session)
    cmd = CreateRecipeCommand(
        name="Instagram Feed Post Flow",
        platform=PlatformType.INSTAGRAM,
        description="Standard single-photo feed posting recipe",
        steps=[
            {"type": "click", "description": "Click Create", "selectors": ["[aria-label='Create']"]},
            {"type": "upload", "description": "Upload file", "target": "input[type='file']"},
        ],
        is_default=True,
    )

    recipe = await service.create_recipe(cmd)

    assert recipe.id is not None
    assert recipe.name == "Instagram Feed Post Flow"
    assert recipe.platform == PlatformType.INSTAGRAM
    assert recipe.is_default is True
    assert len(recipe.steps) == 2

    # Query back
    queried = await service.get_recipe_by_id_or_raise(recipe.id)
    assert queried.id == recipe.id


@pytest.mark.anyio
async def test_get_nonexistent_recipe_raises_not_found(db_session: AsyncSession):
    service = RecipeService(db_session)
    with pytest.raises(RecipeNotFoundError):
        await service.get_recipe_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_create_duplicate_recipe_name_same_platform_raises(db_session: AsyncSession):
    service = RecipeService(db_session)
    cmd = CreateRecipeCommand(
        name="Twitter Thread",
        platform=PlatformType.TWITTER,
    )
    await service.create_recipe(cmd)

    with pytest.raises(RecipeAlreadyExistsError):
        await service.create_recipe(cmd)


@pytest.mark.anyio
async def test_same_recipe_name_different_platforms_allowed(db_session: AsyncSession):
    service = RecipeService(db_session)
    r1 = await service.create_recipe(
        CreateRecipeCommand(name="Cold DM Outreach", platform=PlatformType.INSTAGRAM)
    )
    r2 = await service.create_recipe(
        CreateRecipeCommand(name="Cold DM Outreach", platform=PlatformType.TWITTER)
    )

    assert r1.id != r2.id
    assert r1.platform == PlatformType.INSTAGRAM
    assert r2.platform == PlatformType.TWITTER


@pytest.mark.anyio
async def test_default_recipe_toggling(db_session: AsyncSession):
    """
    Ensures marking a new recipe as default automatically unsets any
    previous default recipe for that same platform.
    """
    service = RecipeService(db_session)

    # 1. Create Recipe A as default
    recipe_a = await service.create_recipe(
        CreateRecipeCommand(
            name="Feed Recipe A",
            platform=PlatformType.INSTAGRAM,
            is_default=True,
        )
    )
    assert recipe_a.is_default is True

    # 2. Create Recipe B also as default
    recipe_b = await service.create_recipe(
        CreateRecipeCommand(
            name="Feed Recipe B",
            platform=PlatformType.INSTAGRAM,
            is_default=True,
        )
    )

    await db_session.refresh(recipe_a)
    assert recipe_a.is_default is False  # Automatically unset
    assert recipe_b.is_default is True

    # Query default helper returns Recipe B
    default_recipe = await service.get_default_recipe(PlatformType.INSTAGRAM)
    assert default_recipe is not None
    assert default_recipe.id == recipe_b.id


@pytest.mark.anyio
async def test_update_recipe_toggle_default_unsets_previous(db_session: AsyncSession):
    service = RecipeService(db_session)
    r1 = await service.create_recipe(
        CreateRecipeCommand(name="R1", platform=PlatformType.TWITTER, is_default=True)
    )
    r2 = await service.create_recipe(
        CreateRecipeCommand(name="R2", platform=PlatformType.TWITTER, is_default=False)
    )

    await service.update_recipe(UpdateRecipeCommand(recipe_id=r2.id, is_default=True))

    await db_session.refresh(r1)
    await db_session.refresh(r2)
    assert r1.is_default is False
    assert r2.is_default is True


@pytest.mark.anyio
async def test_get_default_recipe_returns_none_when_no_default(db_session: AsyncSession):
    service = RecipeService(db_session)
    default = await service.get_default_recipe(PlatformType.FACEBOOK)
    assert default is None


@pytest.mark.anyio
async def test_list_recipes_with_filters(db_session: AsyncSession):
    service = RecipeService(db_session)
    await service.create_recipe(CreateRecipeCommand(name="IG Post", platform=PlatformType.INSTAGRAM))
    await service.create_recipe(CreateRecipeCommand(name="IG Reel", platform=PlatformType.INSTAGRAM))
    await service.create_recipe(CreateRecipeCommand(name="X Post", platform=PlatformType.TWITTER))

    # Filter by platform
    ig_recipes = await service.list_recipes(platform=PlatformType.INSTAGRAM)
    assert len(ig_recipes) == 2

    # All
    all_recipes = await service.list_recipes()
    assert len(all_recipes) == 3


@pytest.mark.anyio
async def test_update_and_delete_recipe(db_session: AsyncSession):
    service = RecipeService(db_session)
    recipe = await service.create_recipe(
        CreateRecipeCommand(name="Old Name", platform=PlatformType.TWITTER)
    )

    # Update
    updated = await service.update_recipe(
        UpdateRecipeCommand(
            recipe_id=recipe.id,
            name="New Name",
            description="Updated description",
            is_active=False,
        )
    )
    assert updated.name == "New Name"
    assert updated.description == "Updated description"
    assert updated.is_active is False

    # Delete
    await service.delete_recipe(recipe.id)
    assert await service.get_recipe_by_id(recipe.id) is None


@pytest.mark.anyio
async def test_update_recipe_rename_conflict_raises(db_session: AsyncSession):
    service = RecipeService(db_session)
    await service.create_recipe(CreateRecipeCommand(name="Existing Name", platform=PlatformType.TWITTER))
    r2 = await service.create_recipe(CreateRecipeCommand(name="Original Name", platform=PlatformType.TWITTER))

    with pytest.raises(RecipeAlreadyExistsError):
        await service.update_recipe(UpdateRecipeCommand(recipe_id=r2.id, name="Existing Name"))
