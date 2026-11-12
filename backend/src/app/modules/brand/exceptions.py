from uuid import UUID

from app.common.exceptions import NotFoundError


class BrandKitNotFoundError(NotFoundError):
    """Raised when a BrandKit record does not exist."""

    def __init__(self, brand_kit_id: UUID | str):
        super().__init__(f"Brand Kit with ID '{brand_kit_id}' was not found.")
        self.brand_kit_id = brand_kit_id
