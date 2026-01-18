"""Service for bulk photo validation with background processing."""

import os
import io
import zipfile
import csv
import logging
import tempfile
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

from PIL import Image

from app.services.photo_validation import PhotoValidationService
from app.config import settings

logger = logging.getLogger(__name__)


class BulkPhotoValidationResult:
    """Result for a single photo validation in bulk processing."""

    def __init__(self, filename: str, is_valid: bool, error_message: Optional[str] = None,
                 validation_details: Optional[Dict[str, Any]] = None):
        self.filename = filename
        self.is_valid = is_valid
        self.error_message = error_message
        self.validation_details = validation_details or {}


async def process_bulk_photo_validation(
    files: List[Tuple[str, bytes]],
    validation_level: str = "strict",
    progress_callback: Optional[callable] = None
) -> Tuple[List[BulkPhotoValidationResult], bytes]:
    """
    Process bulk photo validation and create zip file with results.

    Args:
        files: List of tuples (filename, file_bytes)
        validation_level: Validation level - "basic", "standard", or "strict"
        progress_callback: Optional callback function(current, total) for progress updates

    Returns:
        Tuple of (validation_results_list, zip_file_bytes)
    """
    results: List[BulkPhotoValidationResult] = []
    total = len(files)

    # Create temporary directories for valid/invalid photos
    with tempfile.TemporaryDirectory() as temp_dir:
        valid_dir = os.path.join(temp_dir, "valid")
        invalid_dir = os.path.join(temp_dir, "invalid")
        os.makedirs(valid_dir, exist_ok=True)
        os.makedirs(invalid_dir, exist_ok=True)

        # Process each photo
        for idx, (filename, file_bytes) in enumerate(files):
            try:
                # Update progress
                if progress_callback:
                    progress_callback(idx + 1, total)

                # Validate photo
                try:
                    # Try to get mime type from filename
                    mime_type = "image/jpeg"  # Default
                    if filename.lower().endswith(".png"):
                        mime_type = "image/png"
                    elif filename.lower().endswith((".jpg", ".jpeg")):
                        mime_type = "image/jpeg"

                    # Perform validation
                    PhotoValidationService.validate_all(file_bytes, mime_type, validation_level)

                    # Photo is valid
                    results.append(BulkPhotoValidationResult(
                        filename=filename,
                        is_valid=True
                    ))

                    # Copy to valid folder
                    valid_path = os.path.join(valid_dir, filename)
                    with open(valid_path, "wb") as f:
                        f.write(file_bytes)

                except Exception as e:
                    # Photo validation failed
                    error_msg = str(e)
                    if hasattr(e, "detail") and isinstance(e.detail, dict):
                        errors_list = e.detail.get("errors", [])
                        error_msg = "; ".join(errors_list) if errors_list else str(e)

                    results.append(BulkPhotoValidationResult(
                        filename=filename,
                        is_valid=False,
                        error_message=error_msg
                    ))

                    # Copy to invalid folder with error info in filename
                    base_name = Path(filename).stem
                    ext = Path(filename).suffix
                    # Keep original filename but could add error suffix if needed
                    invalid_path = os.path.join(invalid_dir, filename)
                    with open(invalid_path, "wb") as f:
                        f.write(file_bytes)

            except Exception as e:
                logger.error(f"Error processing photo {filename}: {e}", exc_info=True)
                results.append(BulkPhotoValidationResult(
                    filename=filename,
                    is_valid=False,
                    error_message=f"Processing error: {str(e)}"
                ))

        # Generate validation report CSV
        report_path = os.path.join(temp_dir, "validation_report.csv")
        with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(["Filename", "Status", "Error Message"])
            for result in results:
                writer.writerow([
                    result.filename,
                    "VALID" if result.is_valid else "INVALID",
                    result.error_message or ""
                ])

        # Create zip file
        zip_bytes = io.BytesIO()
        with zipfile.ZipFile(zip_bytes, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Add valid photos
            for filename in os.listdir(valid_dir):
                file_path = os.path.join(valid_dir, filename)
                zipf.write(file_path, f"valid/{filename}")

            # Add invalid photos
            for filename in os.listdir(invalid_dir):
                file_path = os.path.join(invalid_dir, filename)
                zipf.write(file_path, f"invalid/{filename}")

            # Add validation report
            zipf.write(report_path, "validation_report.csv")

        zip_bytes.seek(0)
        return results, zip_bytes.getvalue()


def get_validation_summary(results: List[BulkPhotoValidationResult]) -> Dict[str, Any]:
    """Get summary statistics from validation results."""
    total = len(results)
    valid_count = sum(1 for r in results if r.is_valid)
    invalid_count = total - valid_count

    return {
        "total": total,
        "valid": valid_count,
        "invalid": invalid_count,
        "valid_percentage": (valid_count / total * 100) if total > 0 else 0.0
    }


class BulkPhotoResizeResult:
    """Result for a single photo resize in bulk processing."""

    def __init__(self, filename: str, success: bool, original_size: Optional[Tuple[int, int]] = None,
                 error_message: Optional[str] = None):
        self.filename = filename
        self.success = success
        self.original_size = original_size
        self.error_message = error_message


async def process_bulk_photo_resize(
    files: List[Tuple[str, bytes]],
    target_width: int = 155,
    target_height: int = 191,
    maintain_aspect_ratio: bool = False
) -> Tuple[List[BulkPhotoResizeResult], bytes]:
    """
    Process bulk photo resizing and create zip file with resized photos.

    Args:
        files: List of tuples (filename, file_bytes)
        target_width: Target width in pixels (default: 155 for passport photos)
        target_height: Target height in pixels (default: 191 for passport photos)
        maintain_aspect_ratio: If True, maintain aspect ratio and pad if needed. If False, stretch to exact dimensions.

    Returns:
        Tuple of (resize_results_list, zip_file_bytes)
    """
    results: List[BulkPhotoResizeResult] = []

    # Create temporary directory for resized photos
    with tempfile.TemporaryDirectory() as temp_dir:
        resized_dir = os.path.join(temp_dir, "resized")
        os.makedirs(resized_dir, exist_ok=True)

        # Process each photo
        for filename, file_bytes in files:
            try:
                # Open image
                image = Image.open(io.BytesIO(file_bytes))
                original_size = image.size  # (width, height)

                # Resize image
                if maintain_aspect_ratio:
                    # Resize maintaining aspect ratio, then center on target size with white background
                    image.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)

                    # Create new image with target size and white background
                    resized_image = Image.new("RGB", (target_width, target_height), (255, 255, 255))

                    # Calculate position to center the resized image
                    paste_x = (target_width - image.width) // 2
                    paste_y = (target_height - image.height) // 2

                    # Paste the resized image onto the white background
                    if image.mode == "RGBA":
                        # Handle transparency
                        resized_image.paste(image, (paste_x, paste_y), image)
                    else:
                        resized_image.paste(image, (paste_x, paste_y))
                else:
                    # Resize to exact dimensions (may distort aspect ratio)
                    resized_image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)

                # Convert to RGB if necessary (for JPEG output)
                if resized_image.mode != "RGB":
                    resized_image = resized_image.convert("RGB")

                # Save resized image
                resized_path = os.path.join(resized_dir, filename)

                # Determine output format from filename
                output_format = "JPEG"
                if filename.lower().endswith(".png"):
                    output_format = "PNG"

                # Save image
                output_bytes = io.BytesIO()
                resized_image.save(output_bytes, format=output_format, quality=95)

                # Write to file
                with open(resized_path, "wb") as f:
                    f.write(output_bytes.getvalue())

                results.append(BulkPhotoResizeResult(
                    filename=filename,
                    success=True,
                    original_size=original_size
                ))

            except Exception as e:
                logger.error(f"Error resizing photo {filename}: {e}", exc_info=True)
                results.append(BulkPhotoResizeResult(
                    filename=filename,
                    success=False,
                    error_message=f"Resize error: {str(e)}"
                ))

        # Generate resize report CSV
        report_path = os.path.join(temp_dir, "resize_report.csv")
        with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(["Filename", "Status", "Original Size (WxH)", "Target Size (WxH)", "Error Message"])
            for result in results:
                writer.writerow([
                    result.filename,
                    "SUCCESS" if result.success else "FAILED",
                    f"{result.original_size[0]}x{result.original_size[1]}" if result.original_size else "",
                    f"{target_width}x{target_height}",
                    result.error_message or ""
                ])

        # Create zip file
        zip_bytes = io.BytesIO()
        with zipfile.ZipFile(zip_bytes, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Add resized photos
            for filename in os.listdir(resized_dir):
                file_path = os.path.join(resized_dir, filename)
                zipf.write(file_path, filename)

            # Add resize report
            zipf.write(report_path, "resize_report.csv")

        zip_bytes.seek(0)
        return results, zip_bytes.getvalue()


def get_resize_summary(results: List[BulkPhotoResizeResult]) -> Dict[str, Any]:
    """Get summary statistics from resize results."""
    total = len(results)
    success_count = sum(1 for r in results if r.success)
    failed_count = total - success_count

    return {
        "total": total,
        "success": success_count,
        "failed": failed_count,
        "success_percentage": (success_count / total * 100) if total > 0 else 0.0
    }


class BulkBackgroundReplacementResult:
    """Result for a single photo background replacement in bulk processing."""

    def __init__(self, filename: str, success: bool, error_message: Optional[str] = None):
        self.filename = filename
        self.success = success
        self.error_message = error_message


async def process_bulk_background_replacement(
    files: List[Tuple[str, bytes]],
    background_color: Tuple[int, int, int] = (255, 255, 255)  # White (RGB)
) -> Tuple[List[BulkBackgroundReplacementResult], bytes]:
    """
    Process bulk background replacement and create zip file with processed photos.

    Args:
        files: List of tuples (filename, file_bytes)
        background_color: RGB tuple for background color (default: white 255, 255, 255)

    Returns:
        Tuple of (replacement_results_list, zip_file_bytes)
    """
    from app.services.mediapipe_photo_validation import replace_background

    results: List[BulkBackgroundReplacementResult] = []

    # Create temporary directory for processed photos
    with tempfile.TemporaryDirectory() as temp_dir:
        processed_dir = os.path.join(temp_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)

        # Process each photo
        for filename, file_bytes in files:
            try:
                # Replace background
                processed_bytes = replace_background(file_bytes, background_color)

                # Save processed image
                processed_path = os.path.join(processed_dir, filename)

                # Write to file
                with open(processed_path, "wb") as f:
                    f.write(processed_bytes)

                results.append(BulkBackgroundReplacementResult(
                    filename=filename,
                    success=True
                ))

            except Exception as e:
                logger.error(f"Error replacing background for photo {filename}: {e}", exc_info=True)
                results.append(BulkBackgroundReplacementResult(
                    filename=filename,
                    success=False,
                    error_message=f"Background replacement error: {str(e)}"
                ))

        # Generate replacement report CSV
        report_path = os.path.join(temp_dir, "background_replacement_report.csv")
        with open(report_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(["Filename", "Status", "Background Color (RGB)", "Error Message"])
            for result in results:
                writer.writerow([
                    result.filename,
                    "SUCCESS" if result.success else "FAILED",
                    f"{background_color[0]},{background_color[1]},{background_color[2]}",
                    result.error_message or ""
                ])

        # Create zip file
        zip_bytes = io.BytesIO()
        with zipfile.ZipFile(zip_bytes, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Add processed photos
            for filename in os.listdir(processed_dir):
                file_path = os.path.join(processed_dir, filename)
                zipf.write(file_path, filename)

            # Add replacement report
            zipf.write(report_path, "background_replacement_report.csv")

        zip_bytes.seek(0)
        return results, zip_bytes.getvalue()


def get_background_replacement_summary(results: List[BulkBackgroundReplacementResult]) -> Dict[str, Any]:
    """Get summary statistics from background replacement results."""
    total = len(results)
    success_count = sum(1 for r in results if r.success)
    failed_count = total - success_count

    return {
        "total": total,
        "success": success_count,
        "failed": failed_count,
        "success_percentage": (success_count / total * 100) if total > 0 else 0.0
    }
