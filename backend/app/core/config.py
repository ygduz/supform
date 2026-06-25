"""Application configuration, loaded from environment variables.

All settings are prefixed with ``SUPFORM_`` (see ``.env.example``).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator, model_validator
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

    # Observability — error tracking (no-op until a DSN is set; needs the [monitoring] extra).
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    # Database
    database_url: str = "postgresql+asyncpg://supform:supform@localhost:5432/supform"

    @field_validator("database_url", mode="before")
    @classmethod
    def _fix_db_scheme(cls, v: object) -> object:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14

    # Public base URL of the frontend, used to build links in emails (verify, reset).
    app_base_url: str = "http://localhost:5173"

    # Email delivery (verification & password reset). Backends: console | smtp | memory.
    email_backend: str = "console"
    email_from: str = "Supform <no-reply@supform.local>"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_use_tls: bool = True
    smtp_username: str = ""
    smtp_password: str = ""
    verify_token_expire_minutes: int = 60 * 24  # 24h to confirm an email
    reset_token_expire_minutes: int = 30  # short-lived password-reset window

    # AI form generation (optional; off until an API key is set). Anthropic-compatible.
    ai_api_key: str = ""
    ai_model: str = "claude-sonnet-4-6"
    ai_base_url: str = "https://api.anthropic.com/v1/messages"
    # Request/response shape: "anthropic" (Claude) or "openai" (OpenAI, Ollama, LM Studio,
    # vLLM, OpenRouter, …). Use "openai" with a local server for free, self-hosted AI.
    ai_provider: str = "anthropic"

    # Rate limiting (per client IP, fixed window). Disable in tests that hammer endpoints.
    rate_limit_enabled: bool = True

    # Webhooks
    # Block webhook URLs that point at private/loopback/link-local/metadata addresses
    # (SSRF guard). Disable only if you intentionally deliver to internal services.
    webhook_block_private_ips: bool = True

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
