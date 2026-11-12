from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.enums import PlatformType
from app.modules.recipes.commands import CreateRecipeCommand, UpdateRecipeCommand


class RecipeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    platform: PlatformType
    description: str | None = Field(None, max_length=2000)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    is_default: bool = Field(default=False)
    is_active: bool = Field(default=True)
    extra_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Recipe name cannot be empty")
        return clean

    def to_command(self) -> CreateRecipeCommand:
        return CreateRecipeCommand(**self.model_dump())


class RecipeUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    description: str | None = Field(None, max_length=2000)
    steps: list[dict[str, Any]] | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    extra_metadata: dict[str, Any] | None = None

    def to_command(self, recipe_id: UUID) -> UpdateRecipeCommand:
        return UpdateRecipeCommand(recipe_id=recipe_id, **self.model_dump(exclude_unset=True))


class RecipeResponse(BaseModel):
    id: UUID
    name: str
    platform: PlatformType
    description: str | None = None
    steps: list[dict[str, Any]]
    is_default: bool
    is_active: bool
    extra_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
