"""Application configuration, loaded from environment variables.

All settings are prefixed with ``SUPFORM_`` (see ``.env.example``).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SUPFORM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    env: str = "development"
    debug: bool = True
    secret_key: str = "change-me"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # Database
    database_url: str = "postgresql+asyncpg://supform:supform@localhost:5432/supform"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14

    # Storage
    storage_backend: str = "local"  # local | s3
    storage_local_path: str = "./media"
    max_upload_mb: int = 10
    # S3 / S3-compatible (used when storage_backend == "s3"; endpoint_url targets MinIO etc.)
    s3_bucket: str = ""
    s3_region: str | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_prefix: str = ""

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @model_validator(mode="after")
    def _require_secret_in_production(self) -> Settings:
        """Refuse to boot in production with the default signing key — forged-JWT guard."""
        if self.is_production and self.secret_key == "change-me":
            raise ValueError(
                "SUPFORM_SECRET_KEY must be set to a strong, unique value in production."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (import this everywhere)."""
    return Settings()


settings = get_settings()
