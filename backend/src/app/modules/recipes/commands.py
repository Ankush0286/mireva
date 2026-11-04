from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.common.enums import PlatformType


@dataclass(frozen=True)
class CreateRecipeCommand:
    name: str
    platform: PlatformType
    description: str | None = None
    steps: list[dict[str, Any]] = field(default_factory=list)
    is_default: bool = False
    is_active: bool = True
    extra_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class UpdateRecipeCommand:
    recipe_id: UUID
    name: str | None = None
    description: str | None = None
    steps: list[dict[str, Any]] | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    extra_metadata: dict[str, Any] | None = None
