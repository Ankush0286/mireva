from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.common.enums import ConnectorType
from app.db.dependencies import get_db_session
from app.modules.connectors.schemas import (
    ConnectorCreateRequest,
    ConnectorResponse,
    ConnectorUpdateRequest,
    MetricOpportunityItem,
)
from app.modules.connectors.service import ConnectorService

router = APIRouter()


def get_connector_service(db: Session = Depends(get_db_session)) -> ConnectorService:
    """Dependency injection factory for ConnectorService."""
    return ConnectorService(db)


@router.post(
    "/",
    response_model=ConnectorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new external data source (GSC, Ahrefs, GA4)",
)
def create_connector(
    payload: ConnectorCreateRequest,
    service: ConnectorService = Depends(get_connector_service),
) -> ConnectorResponse:
    connector = service.create_connector(payload.to_command())
    return ConnectorResponse.model_validate(connector)


@router.get(
    "/",
    response_model=list[ConnectorResponse],
    status_code=status.HTTP_200_OK,
    summary="List all registered data source connectors",
)
def list_connectors(
    connector_type: ConnectorType | None = Query(default=None, description="Filter by provider type"),
    active_only: bool = Query(default=False, description="Filter active sources only"),
    service: ConnectorService = Depends(get_connector_service),
) -> list[ConnectorResponse]:
    connectors = service.list_connectors(connector_type=connector_type, active_only=active_only)
    return [ConnectorResponse.model_validate(c) for c in connectors]


@router.get(
    "/{connector_id}",
    response_model=ConnectorResponse,
    status_code=status.HTTP_200_OK,
    summary="Get data connector metadata by ID",
)
def get_connector(
    connector_id: UUID,
    service: ConnectorService = Depends(get_connector_service),
) -> ConnectorResponse:
    connector = service.get_by_id_or_raise(connector_id)
    return ConnectorResponse.model_validate(connector)


@router.patch(
    "/{connector_id}",
    response_model=ConnectorResponse,
    status_code=status.HTTP_200_OK,
    summary="Update connector configuration or rotate credentials",
)
def update_connector(
    connector_id: UUID,
    payload: ConnectorUpdateRequest,
    service: ConnectorService = Depends(get_connector_service),
) -> ConnectorResponse:
    connector = service.update_connector(payload.to_command(connector_id))
    return ConnectorResponse.model_validate(connector)


@router.delete(
    "/{connector_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect and delete a data connector",
)
def delete_connector(
    connector_id: UUID,
    service: ConnectorService = Depends(get_connector_service),
) -> None:
    service.delete_connector(connector_id)


@router.post(
    "/{connector_id}/test",
    status_code=status.HTTP_200_OK,
    summary="Test authentication and connection against the external service",
)
async def test_connector(
    connector_id: UUID,
    service: ConnectorService = Depends(get_connector_service),
) -> dict[str, Any]:
    is_valid = await service.test_connection(connector_id)
    return {
        "status": "connected" if is_valid else "failed",
        "verified": is_valid,
    }


@router.get(
    "/{connector_id}/opportunities",
    response_model=list[MetricOpportunityItem],
    status_code=status.HTTP_200_OK,
    summary="Query distilled marketing keyword and content opportunities",
)
async def get_opportunities(
    connector_id: UUID,
    min_impressions: int = Query(default=200, ge=1, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
    service: ConnectorService = Depends(get_connector_service),
) -> list[MetricOpportunityItem]:
    return await service.fetch_opportunities(
        connector_id=connector_id,
        min_impressions=min_impressions,
        limit=limit,
    )
