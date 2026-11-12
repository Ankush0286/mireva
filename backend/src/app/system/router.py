from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dependencies import get_db_session
from app.system.schemas import (
    SeedRecipesResponse,
    SystemDiagnosticsResponse,
    WorkerTriggerResponse,
)
from app.system.service import SystemDiagnosticsService

router = APIRouter()


def get_system_service(db: AsyncSession = Depends(get_db_session)) -> SystemDiagnosticsService:
    return SystemDiagnosticsService(db)


@router.get(
    "/diagnostics",
    response_model=SystemDiagnosticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Run full system health audit and recipe coverage check",
)
async def get_system_diagnostics(
    service: SystemDiagnosticsService = Depends(get_system_service),
) -> SystemDiagnosticsResponse:
    return await service.get_diagnostics()


@router.post(
    "/seed-recipes",
    response_model=SeedRecipesResponse,
    status_code=status.HTTP_200_OK,
    summary="Idempotently seed all default platform action recipes",
)
async def seed_default_recipes(
    service: SystemDiagnosticsService = Depends(get_system_service),
) -> SeedRecipesResponse:
    return await service.seed_default_recipes()


@router.post(
    "/sync-replica",
    status_code=status.HTTP_200_OK,
    summary="Force immediate synchronization with Turso Cloud replica",
)
async def sync_database_replica(
    service: SystemDiagnosticsService = Depends(get_system_service),
) -> dict[str, Any]:
    return await service.trigger_replica_sync()


@router.post(
    "/workers/{worker_name}/run",
    response_model=WorkerTriggerResponse,
    status_code=status.HTTP_200_OK,
    summary="Manually trigger a background automation worker cycle",
)
async def trigger_worker_now(
    worker_name: str,
    service: SystemDiagnosticsService = Depends(get_system_service),
) -> WorkerTriggerResponse:
    return await service.run_worker_now(worker_name)
