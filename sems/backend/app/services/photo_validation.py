import io
import logging
from typing import Any

from fastapi import HTTPException, status
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class PhotoValidationService:
    """Service for validating candidate passport photos."""

    @staticmethod
    def validate_file_type(content: bytes, mime_type: str) -> tuple[bool, str | None]:
        """
        Validate that the file is a JPEG image.

        Args:
            content: File content as bytes
            mime_type: MIME type of the file

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        if mime_type != "image/jpeg":
            return False, f"File must be JPEG format. Got: {mime_type}"
        return True, None

    @staticmethod
    def validate_dimensions(image_data: bytes) -> tuple[bool, str | None]:
        """
        Validate image dimensions are within required limits.

        Args:
            image_data: Image file content as bytes

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            width, height = image.size

            if width < settings.photo_min_width or height < settings.photo_min_height:
                return False, (
                    f"Image dimensions ({width}x{height}) are too small. "
                    f"Minimum required: {settings.photo_min_width}x{settings.photo_min_height} pixels"
                )

            if width > settings.photo_max_width or height > settings.photo_max_height:
                return False, (
                    f"Image dimensions ({width}x{height}) are too large. "
                    f"Maximum allowed: {settings.photo_max_width}x{settings.photo_max_height} pixels"
                )

            return True, None
        except Exception as e:
            logger.error(f"Error validating image dimensions: {e}")
            return False, f"Failed to read image dimensions: {str(e)}"

    @staticmethod
    def validate_file_size(content: bytes) -> tuple[bool, str | None]:
        """
        Validate file size is within the maximum limit.

        Args:
            content: File content as bytes

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        file_size = len(content)
        if file_size > settings.photo_max_file_size:
            max_size_mb = settings.photo_max_file_size / (1024 * 1024)
            file_size_mb = file_size / (1024 * 1024)
            return False, (
                f"File size ({file_size_mb:.2f}MB) exceeds maximum allowed size ({max_size_mb:.2f}MB)"
            )
        return True, None

    @staticmethod
    def validate_all(content: bytes, mime_type: str) -> dict[str, Any]:
        """
        Perform all validation checks and raise HTTPException if invalid.

        Args:
            content: File content as bytes
            mime_type: MIME type of the file

        Returns:
            dict: Validation result with 'is_valid' and 'errors' keys

        Raises:
            HTTPException: If validation fails
        """
        errors: list[str] = []

        # Validate file type
        is_valid, error = PhotoValidationService.validate_file_type(content, mime_type)
        if not is_valid:
            errors.append(error)

        # Validate dimensions
        is_valid, error = PhotoValidationService.validate_dimensions(content)
        if not is_valid:
            errors.append(error)

        # Validate file size
        is_valid, error = PhotoValidationService.validate_file_size(content)
        if not is_valid:
            errors.append(error)

        if errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"errors": errors, "message": "Photo validation failed"},
            )

        return {"is_valid": True, "errors": []}
