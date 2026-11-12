from uuid import UUID

from app.common.exceptions import AppError, ConflictError, NotFoundError


class RecipeNotFoundError(NotFoundError):
    """Raised when an action recipe ID does not exist."""

    def __init__(self, recipe_id: UUID | str):
        super().__init__(f"Action recipe with ID '{recipe_id}' was not found.")
        self.recipe_id = recipe_id


class RecipeAlreadyExistsError(ConflictError):
    """Raised when creating a duplicate recipe name for the same platform."""

    def __init__(self, platform: str, name: str):
        super().__init__(f"Recipe '{name}' already exists for platform '{platform}'.")
        self.platform = platform
        self.name = name


class InvalidRecipeError(AppError):
    """Raised when recipe step validation fails."""

    def __init__(self, message: str = "Invalid action recipe definitions or empty steps provided."):
        super().__init__(message)
