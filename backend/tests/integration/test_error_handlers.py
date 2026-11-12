import pytest
from fastapi import APIRouter
from httpx import AsyncClient

from app.common.exceptions import (
    AuthenticationFailedError,
    RateLimitExceededError,
)
from app.main import app

# Create mock router and include in the global app for the test client
error_mock_router = APIRouter(prefix="/test-errors")


@error_mock_router.get("/rate-limit")
async def trigger_rate_limit():
    raise RateLimitExceededError("Daily limit hit")


@error_mock_router.get("/unauthorized")
async def trigger_unauthorized():
    raise AuthenticationFailedError("Bad API credentials")


@error_mock_router.get("/unhandled")
async def trigger_unhandled():
    raise RuntimeError("Unexpected failure")


app.include_router(error_mock_router)


@pytest.mark.anyio
async def test_rate_limit_maps_to_429(client: AsyncClient):
    res = await client.get("/test-errors/rate-limit")
    assert res.status_code == 429

    data = res.json()
    assert data["error"] == "RATE_LIMIT_EXCEEDED"
    assert data["detail"] == "Daily limit hit"


@pytest.mark.anyio
async def test_auth_failed_maps_to_401(client: AsyncClient):
    res = await client.get("/test-errors/unauthorized")
    assert res.status_code == 401

    data = res.json()
    assert data["error"] == "UNAUTHORIZED"
    assert data["detail"] == "Bad API credentials"


@pytest.mark.anyio
async def test_unhandled_exception_maps_to_500(client: AsyncClient):
    res = await client.get("/test-errors/unhandled")
    assert res.status_code == 500

    data = res.json()
    assert data["error"] == "INTERNAL_SERVER_ERROR"
