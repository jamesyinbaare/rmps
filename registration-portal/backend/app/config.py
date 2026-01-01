from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Storage settings
    storage_backend: str = "local"  # local, s3, azure
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    photo_storage_path: str = "storage/photos"
    export_storage_path: str = "storage/exports"
    # Authentication settings
    secret_key: str = "registration-portal-secret-key-change-in-production"  # Should be set via environment variable
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    inactivity_timeout_minutes: int = 30  # For frontend reference
    password_min_length: int = 8
    # Photo validation settings
    photo_max_width: int = 600
    photo_max_height: int = 600
    photo_min_width: int = 200
    photo_min_height: int = 200
    photo_max_file_size: int = 2 * 1024 * 1024  # 2MB
    # File upload settings
    upload_max_size: int = 10 * 1024 * 1024  # 10MB for CSV/Excel uploads
    # System admin initialization settings
    system_admin_email: str = ""  # Required: Email for the initial SYSTEM_ADMIN user
    system_admin_password: str = ""  # Required: Password for the initial SYSTEM_ADMIN user
    system_admin_full_name: str = ""  # Required: Full name for the initial SYSTEM_ADMIN user


class LoggingSettings(BaseSettings):
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # "text" or "json"
    ENV: str = "dev"  # dev | staging | prod

    class Config:
        env_prefix = "APP_"


logging_settings = LoggingSettings()

settings = Settings()  # type: ignore
