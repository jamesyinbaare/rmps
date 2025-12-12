from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Storage settings
    storage_backend: str = "local"  # local, s3, azure
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    # Extraction settings
    barcode_enabled: bool = True
    ocr_enabled: bool = True
    min_confidence_threshold: float = 0.7
    # OCR preprocessing settings
    ocr_resize_width: int = 1654
    ocr_resize_height: int = 2339
    ocr_roi_left: int = 1120
    ocr_roi_top: int = 370
    ocr_roi_right: int = 1530
    ocr_roi_bottom: int = 445
    # Batch settings
    batch_max_files: int = 100
    batch_timeout: int = 3600  # 1 hour in seconds
    # Duplicate detection settings
    reject_duplicate_files: bool = True  # If True, reject duplicates; If False, return existing document


settings = Settings()  # type: ignore
