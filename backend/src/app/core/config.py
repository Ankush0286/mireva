from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from backend/.env or environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Core Application
    APP_NAME: str = "Mireva"
    DEBUG: bool = False

    # Database Configuration (PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    # Connection Pool Settings
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5

    # AI Model Gateways (Defaults allow running with either provider or in CI tests)
    OPENROUTER_API_KEY: SecretStr = SecretStr("")
    FIREWORKS_API_KEY: SecretStr = SecretStr("")

    # Master Vault Encryption Key (AES-128 Fernet)
    SECRET_KEY: SecretStr = SecretStr("default-dev-secret-key-32-bytes!")

    # Default Agent Model
    AGENT_MODEL: str = "nvidia/nemotron-3-ultra-550b-a55b:free"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()