from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
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

settings = Settings()  # type: ignore
