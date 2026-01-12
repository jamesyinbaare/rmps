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
    # Paystack settings
    paystack_secret_key: str = ""  # Paystack secret key
    paystack_public_key: str = ""  # Paystack public key (for frontend)
    paystack_webhook_secret: str = ""  # Paystack webhook verification secret
    paystack_callback_base_url: str = ""  # Base URL for payment callbacks (e.g., http://localhost:3001 or https://yourdomain.com)
    frontend_base_url: str = ""  # Base URL for frontend (e.g., http://localhost:3000 or https://yourdomain.com) - used for QR codes and public links
    # Certificate request pricing
    certificate_request_price: float = 100  # Price for certificate requests
    attestation_request_price: float = 80  # Price for attestation requests
    courier_fee: float = 50  # Additional fee for courier delivery
    express_service_multiplier: float = 1.5  # Multiplier for express service (e.g., 1.5x base price)
    # Certificate request file storage
    certificate_request_storage_path: str = "storage/certificate_requests"
    # PDF signing settings
    pdf_signing_enabled: bool = True  # Feature flag for PDF signing (set to True and configure certificate to enable)
    pdf_signing_certificate_path: str = ""  # Path to certificate file (.pem, .p12, .pfx)
    pdf_signing_key_path: str = ""  # Path to private key file (if separate from certificate)
    pdf_signing_certificate_password: str = ""  # Password for certificate (if password-protected)
    pdf_signing_certificate_chain_path: str = ""  # Optional: Path to certificate chain file (intermediate/root CAs) for better verification
    pdf_signing_reason: str = "Certificate Confirmation Response"  # Signing reason (visible in signature properties)
    pdf_signing_location: str = "Ghana"  # Signing location (visible in signature properties)
    pdf_signing_contact_info: str = ""  # Contact information (visible in signature properties)
    pdf_signing_organization: str = ""  # Organization name (for certificate metadata)
    # Permission management settings
    permission_management_min_role: str = "Director"  # Minimum role required to manage permissions (role name as string)


class LoggingSettings(BaseSettings):
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # "text" or "json"
    ENV: str = "dev"  # dev | staging | prod

    class Config:
        env_prefix = "APP_"


logging_settings = LoggingSettings()

settings = Settings()  # type: ignore
