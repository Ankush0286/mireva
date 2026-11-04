from typing import Any

from sqlalchemy import JSON, Boolean, Index, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base_models import AuditBase
from app.common.enums import PlatformType


class ActionRecipe(AuditBase):
    """
    Stores recorded browser automation workflows and selector sequences.
    """

    __tablename__ = "action_recipes"

    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    platform: Mapped[PlatformType] = mapped_column(
        SAEnum(PlatformType, native_enum=False), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (Index("ix_action_recipes_platform_default", "platform", "is_default"),)
