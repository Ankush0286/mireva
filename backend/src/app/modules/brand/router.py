from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dependencies import get_db_session
from app.modules.brand.schemas import (
    BrandKitCreateRequest,
    BrandKitResponse,
    BrandKitUpdateRequest,
)
from app.modules.brand.service import BrandService

router = APIRouter()


def get_brand_service(db: AsyncSession = Depends(get_db_session)) -> BrandService:
    return BrandService(db)


@router.get(
    "/primary",
    response_model=BrandKitResponse,
    status_code=status.HTTP_200_OK,
    summary="Get active primary Brand Kit",
)
async def get_primary_brand_kit(
    service: BrandService = Depends(get_brand_service),
) -> BrandKitResponse:
    kit = await service.get_or_create_default_primary()
    return BrandKitResponse.model_validate(kit)


@router.post(
    "/",
    response_model=BrandKitResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Brand Kit",
)
async def create_brand_kit(
    payload: BrandKitCreateRequest,
    service: BrandService = Depends(get_brand_service),
) -> BrandKitResponse:
    kit = await service.create_brand_kit(payload.to_command())
    return BrandKitResponse.model_validate(kit)


@router.patch(
    "/{brand_kit_id}",
    response_model=BrandKitResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Brand Kit voice, personas, or value props",
)
async def update_brand_kit(
    brand_kit_id: UUID,
    payload: BrandKitUpdateRequest,
    service: BrandService = Depends(get_brand_service),
) -> BrandKitResponse:
    kit = await service.update_brand_kit(payload.to_command(brand_kit_id))
    return BrandKitResponse.model_validate(kit)
