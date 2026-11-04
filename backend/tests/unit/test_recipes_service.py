from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.common.enums import PlatformType
from app.modules.recipes.commands import CreateRecipeCommand, UpdateRecipeCommand
from app.modules.recipes.exceptions import (
    RecipeAlreadyExistsError,
    RecipeNotFoundError,
)
from app.modules.recipes.service import RecipeService


def test_create_and_get_recipe(db_session: Session):
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

    recipe = service.create_recipe(cmd)

    assert recipe.id is not None
    assert recipe.name == "Instagram Feed Post Flow"
    assert recipe.platform == PlatformType.INSTAGRAM
    assert recipe.is_default is True
    assert len(recipe.steps) == 2

    # Query back
    queried = service.get_recipe_by_id_or_raise(recipe.id)
    assert queried.id == recipe.id


def test_get_nonexistent_recipe_raises_not_found(db_session: Session):
    service = RecipeService(db_session)
    with pytest.raises(RecipeNotFoundError):
        service.get_recipe_by_id_or_raise(uuid4())


def test_create_duplicate_recipe_name_same_platform_raises(db_session: Session):
    service = RecipeService(db_session)
    cmd = CreateRecipeCommand(
        name="Twitter Thread",
        platform=PlatformType.TWITTER,
    )
    service.create_recipe(cmd)

    with pytest.raises(RecipeAlreadyExistsError):
        service.create_recipe(cmd)


def test_same_recipe_name_different_platforms_allowed(db_session: Session):
    service = RecipeService(db_session)
    r1 = service.create_recipe(
        CreateRecipeCommand(name="Cold DM Outreach", platform=PlatformType.INSTAGRAM)
    )
    r2 = service.create_recipe(
        CreateRecipeCommand(name="Cold DM Outreach", platform=PlatformType.TWITTER)
    )

    assert r1.id != r2.id
    assert r1.platform == PlatformType.INSTAGRAM
    assert r2.platform == PlatformType.TWITTER


def test_default_recipe_toggling(db_session: Session):
    """
    Ensures marking a new recipe as default automatically unsets any
    previous default recipe for that same platform.
    """
    service = RecipeService(db_session)

    # 1. Create Recipe A as default
    recipe_a = service.create_recipe(
        CreateRecipeCommand(
            name="Feed Recipe A",
            platform=PlatformType.INSTAGRAM,
            is_default=True,
        )
    )
    assert recipe_a.is_default is True

    # 2. Create Recipe B also as default
    recipe_b = service.create_recipe(
        CreateRecipeCommand(
            name="Feed Recipe B",
            platform=PlatformType.INSTAGRAM,
            is_default=True,
        )
    )

    db_session.refresh(recipe_a)
    assert recipe_a.is_default is False  # Automatically unset!
    assert recipe_b.is_default is True

    # Query default helper returns Recipe B
    default_recipe = service.get_default_recipe(PlatformType.INSTAGRAM)
    assert default_recipe is not None
    assert default_recipe.id == recipe_b.id


def test_list_recipes_with_filters(db_session: Session):
    service = RecipeService(db_session)
    service.create_recipe(CreateRecipeCommand(name="IG Post", platform=PlatformType.INSTAGRAM))
    service.create_recipe(CreateRecipeCommand(name="IG Reel", platform=PlatformType.INSTAGRAM))
    service.create_recipe(CreateRecipeCommand(name="X Post", platform=PlatformType.TWITTER))

    # Filter by platform
    ig_recipes = service.list_recipes(platform=PlatformType.INSTAGRAM)
    assert len(ig_recipes) == 2

    # All
    all_recipes = service.list_recipes()
    assert len(all_recipes) == 3


def test_update_and_delete_recipe(db_session: Session):
    service = RecipeService(db_session)
    recipe = service.create_recipe(
        CreateRecipeCommand(name="Old Name", platform=PlatformType.TWITTER)
    )

    # Update
    updated = service.update_recipe(
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
    service.delete_recipe(recipe.id)
    assert service.get_recipe_by_id(recipe.id) is None
