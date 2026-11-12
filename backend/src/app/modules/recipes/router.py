import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import PlatformType
from app.db.dependencies import get_db_session
from app.modules.recipes.schemas import (
    RecipeCreateRequest,
    RecipeResponse,
    RecipeUpdateRequest,
)
from app.modules.recipes.service import RecipeService

logger = logging.getLogger(__name__)
router = APIRouter()


def get_recipe_service(db: AsyncSession = Depends(get_db_session)) -> RecipeService:
    return RecipeService(db)


@router.post(
    "/",
    response_model=RecipeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a newly recorded action recipe",
)
async def create_recipe(
    payload: RecipeCreateRequest,
    service: RecipeService = Depends(get_recipe_service),
) -> RecipeResponse:
    recipe = await service.create_recipe(payload.to_command())
    return RecipeResponse.model_validate(recipe)


@router.get(
    "/",
    response_model=list[RecipeResponse],
    status_code=status.HTTP_200_OK,
    summary="List action recipes with optional platform filter",
)
async def list_recipes(
    platform: PlatformType | None = Query(default=None, description="Filter by platform"),
    active_only: bool = Query(default=False, description="Filter active recipes only"),
    service: RecipeService = Depends(get_recipe_service),
) -> list[RecipeResponse]:
    recipes = await service.list_recipes(platform=platform, active_only=active_only)
    return [RecipeResponse.model_validate(r) for r in recipes]


@router.get(
    "/default",
    response_model=RecipeResponse | None,
    status_code=status.HTTP_200_OK,
    summary="Get default active recipe for a platform",
)
async def get_default_recipe(
    platform: PlatformType = Query(..., description="Target platform"),
    service: RecipeService = Depends(get_recipe_service),
) -> RecipeResponse | None:
    recipe = await service.get_default_recipe(platform=platform)
    if not recipe:
        return None
    return RecipeResponse.model_validate(recipe)


@router.get(
    "/{recipe_id}",
    response_model=RecipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get an action recipe by ID",
)
async def get_recipe(
    recipe_id: UUID,
    service: RecipeService = Depends(get_recipe_service),
) -> RecipeResponse:
    recipe = await service.get_recipe_by_id_or_raise(recipe_id)
    return RecipeResponse.model_validate(recipe)


@router.patch(
    "/{recipe_id}",
    response_model=RecipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Update recipe metadata, steps, or default status",
)
async def update_recipe(
    recipe_id: UUID,
    payload: RecipeUpdateRequest,
    service: RecipeService = Depends(get_recipe_service),
) -> RecipeResponse:
    recipe = await service.update_recipe(payload.to_command(recipe_id))
    return RecipeResponse.model_validate(recipe)


@router.delete(
    "/{recipe_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an action recipe",
)
async def delete_recipe(
    recipe_id: UUID,
    service: RecipeService = Depends(get_recipe_service),
) -> None:
    await service.delete_recipe(recipe_id)
