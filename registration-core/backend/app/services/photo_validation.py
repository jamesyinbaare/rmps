"""Service for validating candidate passport photos."""

import io
import logging
from typing import Optional, Dict, Any

from fastapi import HTTPException, status
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Try to import MediaPipe validation (optional)
try:
    from app.services.mediapipe_photo_validation import (
        get_detector,
        get_segmenter,
        get_landmarker,
        validate_photo_with_mediapipe
    )
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logger.warning("MediaPipe photo validation not available")


class PhotoValidationService:
    """Service for validating candidate passport photos."""

    @staticmethod
    def validate_file_type(content: bytes, mime_type: str) -> tuple[bool, str | None]:
        """
        Validate that the file is a JPEG or PNG image.

        Args:
            content: File content as bytes
            mime_type: MIME type of the file

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        if mime_type not in ("image/jpeg", "image/jpg", "image/png"):
            return False, f"File must be JPEG or PNG format. Got: {mime_type}"
        return True, None

    @staticmethod
    def validate_dimensions(
        image_data: bytes, photo_type: str = "candidate"
    ) -> tuple[bool, str | None]:
        """
        Validate image dimensions by photo type.

        Args:
            image_data: Image file content as bytes
            photo_type: "candidate" (exact candidate_photo_width x candidate_photo_height)
                or "certificate_request_photo" (exact certificate_request_photo_width x certificate_request_photo_height).
                National ID should not call this; use file type + size only.

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        if photo_type == "candidate":
            required_width = settings.candidate_photo_width
            required_height = settings.candidate_photo_height
        elif photo_type == "certificate_request_photo":
            required_width = settings.certificate_request_photo_width
            required_height = settings.certificate_request_photo_height
        else:
            return False, f"Unknown photo_type for dimension validation: {photo_type}"

        try:
            image = Image.open(io.BytesIO(image_data))
            width, height = image.size

            if width != required_width or height != required_height:
                return False, (
                    f"Image dimensions must be exactly {required_width}x{required_height} pixels. "
                    f"Got: {width}x{height} pixels"
                )

            return True, None
        except Exception as e:
            logger.error(f"Error validating image dimensions: {e}")
            return False, f"Failed to read image dimensions: {str(e)}"

    @staticmethod
    def validate_file_size(
        content: bytes, max_size: int | None = None
    ) -> tuple[bool, str | None]:
        """
        Validate file size is within the maximum limit.

        Args:
            content: File content as bytes
            max_size: Optional max size in bytes; defaults to settings.photo_max_file_size

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        limit = max_size if max_size is not None else settings.photo_max_file_size
        file_size = len(content)
        if file_size > limit:
            limit_mb = limit / (1024 * 1024)
            file_size_mb = file_size / (1024 * 1024)
            return False, (
                f"File size ({file_size_mb:.2f}MB) exceeds maximum allowed size ({limit_mb:.2f}MB)"
            )
        return True, None

    @staticmethod
    def validate_all(
        content: bytes,
        mime_type: str,
        validation_level: str = "basic",
        photo_type: str = "candidate",
    ) -> None:
        """
        Perform all validation checks and raise HTTPException if invalid.

        Args:
            content: File content as bytes
            mime_type: MIME type of the file
            validation_level: Validation level - "basic", "standard", or "strict"
                - "basic": File type, dimensions, size only (no MediaPipe)
                - "standard": Basic + face detection (single face required)
                - "strict": Basic + face detection + background color (white/off-white)
            photo_type: "candidate" (exact candidate dimensions), "certificate_request_photo"
                (exact certificate request photo dimensions, e.g. 600x600), or "national_id"
                (file type + max file size only; no dimension validation).

        Raises:
            HTTPException: If validation fails
        """
        errors: list[str] = []

        # Validate file type
        is_valid, error = PhotoValidationService.validate_file_type(content, mime_type)
        if not is_valid:
            errors.append(error)

        # National ID: only file type + size; no dimensions, no MediaPipe
        if photo_type == "national_id":
            is_valid, error = PhotoValidationService.validate_file_size(
                content, max_size=settings.national_id_max_file_size
            )
            if not is_valid:
                errors.append(error)
            if errors:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"errors": errors, "message": "National ID scan validation failed"},
                )
            return

        # Validate dimensions (candidate or certificate_request_photo)
        is_valid, error = PhotoValidationService.validate_dimensions(content, photo_type)
        if not is_valid:
            errors.append(error)

        # Validate file size (candidate/certificate request use photo_max_file_size)
        is_valid, error = PhotoValidationService.validate_file_size(content)
        if not is_valid:
            errors.append(error)

        # MediaPipe validation (if enabled and available)
        if validation_level in ("standard", "strict") and MEDIAPIPE_AVAILABLE:
            try:
                mediapipe_result = validate_photo_with_mediapipe(content, validation_level)

                if not mediapipe_result.get("is_valid", False):
                    # Extract errors from MediaPipe validations
                    validations = mediapipe_result.get("validations", [])
                    for validation in validations:
                        if not validation.get("passed", False):
                            message = validation.get("message", "MediaPipe validation failed")
                            # Remove checkmarks/crosses for cleaner error messages
                            clean_message = message.replace("✓", "").replace("✗", "").strip()
                            if clean_message:
                                errors.append(clean_message)

                # Add any error message from MediaPipe
                if "error" in mediapipe_result:
                    errors.append(f"MediaPipe validation error: {mediapipe_result['error']}")

            except Exception as e:
                logger.warning(f"MediaPipe validation failed: {e}", exc_info=True)
                # Don't fail if MediaPipe validation fails - only log warning
                # This allows graceful fallback to basic validation

        if errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"errors": errors, "message": "Photo validation failed"},
            )

    @staticmethod
    def validate_with_mediapipe_detailed(content: bytes, validation_level: str = "strict") -> Dict[str, Any]:
        """
        Perform MediaPipe validation and return detailed results (does not raise exceptions).

        Args:
            content: Image data as bytes
            validation_level: Validation level - "basic", "standard", or "strict"

        Returns:
            Dictionary with detailed validation results including:
            - is_valid: bool
            - validations: List of validation results with name, passed, message, suggestion
            - overall_score: float (0-1)
            - suggestions: List of improvement suggestions
        """
        if not MEDIAPIPE_AVAILABLE:
            return {
                "is_valid": False,
                "error": "MediaPipe validation not available",
                "validations": [],
                "overall_score": 0.0,
                "suggestions": []
            }

        try:
            return validate_photo_with_mediapipe(content, validation_level)
        except Exception as e:
            logger.error(f"MediaPipe detailed validation error: {e}", exc_info=True)
            return {
                "is_valid": False,
                "error": str(e),
                "validations": [],
                "overall_score": 0.0,
                "suggestions": []
            }
