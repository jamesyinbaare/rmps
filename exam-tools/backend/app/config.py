import json
from typing import Annotated, Any
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Comma-separated in env (CORS_ORIGINS); browser origins allowed for credentialed API calls
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if v is None or v == "":
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        if isinstance(v, str):
            raw = v.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @field_validator("database_url")
    @classmethod
    def validate_database_url_host(cls, v: str) -> str:
        """Reject malformed DB hosts that cause IDNA errors at connect time (e.g. empty DNS labels)."""
        if v is None or not str(v).strip():
            return v
        raw = str(v).strip()
        parsed = urlparse(raw)
        scheme = (parsed.scheme or "").lower()
        if not scheme.startswith("postgresql"):
            return v
        host = parsed.hostname
        if host is None or host == "":
            raise ValueError(
                "DATABASE_URL has no hostname. For Docker Compose staging use host `cloud-sql-proxy` "
                "(see .env.staging.gcp.example). Example: "
                "postgresql+asyncpg://USER:PASSWORD@cloud-sql-proxy:5432/DBNAME"
            )
        if host.startswith(".") or host.endswith(".") or ".." in host:
            raise ValueError(
                f"DATABASE_URL hostname {host!r} is invalid (leading/trailing dot or empty label). "
                "This triggers IDNA errors at connection time. Use a plain hostname such as "
                "`cloud-sql-proxy` with no dots at the ends or doubled dots."
            )
        labels = host.split(".")
        if any(label == "" for label in labels):
            raise ValueError(
                f"DATABASE_URL hostname {host!r} contains an empty DNS label. "
                "Fix the host in DATABASE_URL (staging: `cloud-sql-proxy`)."
            )
        return v

    # Script packing: max answer booklets allowed per physical envelope (env: SCRIPTS_PER_ENVELOPE).
    # Used for paper numbers other than 1 and 2, and as the default when paper-specific overrides are unset.
    scripts_per_envelope: int = Field(default=50, ge=1)
    # Paper 1 default 249; override with env SCRIPTS_PER_ENVELOPE_PAPER_1
    scripts_per_envelope_paper_1: int | None = Field(default=249, ge=1)
    # Paper 2 default 50; override with env SCRIPTS_PER_ENVELOPE_PAPER_2
    scripts_per_envelope_paper_2: int = Field(default=50, ge=1)
    # IANA timezone for "today" when enforcing packing on/after timetable date (env: SCRIPT_PACKING_TIMEZONE)
    script_packing_timezone: str = Field(default="UTC")
    # Storage settings (exam documents: local dir or GCS)
    storage_backend: str = "local"  # local, gcs
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    gcs_bucket_name: str = ""
    gcs_project_id: str = ""
    gcs_credentials_path: str = ""
    # Object prefix inside the bucket for exam document blobs (no leading slash)
    gcs_documents_prefix: str = "exam-tools/documents"



    secret_key: str = "your-secret-key-change-in-production"  # Should be set via environment variable
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    inactivity_timeout_minutes: int = 30  # For frontend reference
    password_min_length: int = 8
    # Super admin initialization settings
    super_admin_email: str = ""  # Required: Email for the initial SUPER_ADMIN user
    super_admin_password: str = ""  # Required: Password for the initial SUPER_ADMIN user
    super_admin_full_name: str = ""  # Required: Full name for the initial SUPER_ADMIN user


class LoggingSettings(BaseSettings):
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # "text" or "json"
    ENV: str = "dev"  # dev | staging | prod

    class Config:
        env_prefix = "APP_"


logging_settings = LoggingSettings()


def script_envelope_cap(paper_number: int) -> int:
    """Effective max booklets per envelope for the given paper (from deployment settings)."""
    s = settings
    if paper_number == 1:
        return s.scripts_per_envelope_paper_1 if s.scripts_per_envelope_paper_1 is not None else s.scripts_per_envelope
    if paper_number == 2:
        return s.scripts_per_envelope_paper_2
    return s.scripts_per_envelope


def resolved_scripts_per_envelope_paper_1() -> int:
    return (
        settings.scripts_per_envelope_paper_1
        if settings.scripts_per_envelope_paper_1 is not None
        else settings.scripts_per_envelope
    )


def resolved_scripts_per_envelope_paper_2() -> int:
    return settings.scripts_per_envelope_paper_2


settings = Settings()  # type: ignore
