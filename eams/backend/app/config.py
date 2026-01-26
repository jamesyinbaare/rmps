"""Application configuration settings."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    database_url: str = ""
    environment: str = "dev"
    # Authentication settings
    secret_key: str = "eams-secret-key-change-in-production"  # Should be set via environment variable
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    password_min_length: int = 8
    # System admin initialization settings
    system_admin_email: str = ""  # Required: Email for the initial SYSTEM_ADMIN user
    system_admin_password: str = ""  # Required: Password for the initial SYSTEM_ADMIN user
    system_admin_full_name: str = ""  # Required: Full name for the initial SYSTEM_ADMIN user
    # Email settings
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "EAMS"
    # Storage settings
    storage_backend: str = "local"  # local, gcs, s3, azure
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    examiner_document_storage_path: str = "storage/examiner-applications"
    # Examiner application settings
    examiner_application_fee: float = 30.00  # GH¢30.00 application fee
    recommendation_token_expiry_days: int = 30  # Days until recommendation token expires


class LoggingSettings(BaseSettings):
    """Logging configuration."""

    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # "text" or "json"
    ENV: str = "dev"  # dev | staging | prod

    class Config:
        env_prefix = "APP_"


logging_settings = LoggingSettings()
settings = Settings()  # type: ignore
