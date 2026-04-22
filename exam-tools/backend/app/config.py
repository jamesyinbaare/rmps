from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Script packing: max answer booklets allowed per physical envelope (env: SCRIPTS_PER_ENVELOPE).
    # Used for paper numbers other than 1 and 2, and as the default when paper-specific overrides are unset.
    scripts_per_envelope: int = Field(default=50, ge=1)
    # Paper 1 default 249; override with env SCRIPTS_PER_ENVELOPE_PAPER_1
    scripts_per_envelope_paper_1: int | None = Field(default=249, ge=1)
    # Paper 2 default 50; override with env SCRIPTS_PER_ENVELOPE_PAPER_2
    scripts_per_envelope_paper_2: int = Field(default=50, ge=1)
    # IANA timezone for "today" when enforcing packing on/after timetable date (env: SCRIPT_PACKING_TIMEZONE)
    script_packing_timezone: str = Field(default="UTC")
    # Storage settings
    storage_backend: str = "local"  # local, s3, azure
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default



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
