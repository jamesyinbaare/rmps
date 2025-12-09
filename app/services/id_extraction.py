import io
from enum import Enum
from typing import Any

import pytesseract
from PIL import Image
from pyzbar import pyzbar
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Document, School, Subject, school_subjects


class ExtractionMethod(str, Enum):
    """ID extraction method."""

    BARCODE = "barcode"
    OCR = "ocr"
    MANUAL = "manual"


class IDValidationResult:
    """Result of ID validation."""

    def __init__(
        self,
        is_valid: bool,
        school_code: str | None = None,
        subject_code: str | None = None,
        test_type: str | None = None,
        sheet_number: str | None = None,
        error_message: str | None = None,
    ):
        self.is_valid = is_valid
        self.school_code = school_code
        self.subject_code = subject_code
        self.test_type = test_type
        self.sheet_number = sheet_number
        self.error_message = error_message


class BarcodeExtractor:
    """Extract ID from barcode (Code 128)."""

    @staticmethod
    async def extract(image_data: bytes) -> tuple[str | None, float]:
        """
        Extract ID from barcode in image.
        Returns (extracted_id, confidence) or (None, 0.0) if failed.
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            barcodes = pyzbar.decode(image)

            if not barcodes:
                return None, 0.0

            # Use first barcode found
            barcode = barcodes[0]
            if barcode.type == "CODE39":
                # Code 128 barcode found
                extracted_id = barcode.data.decode("utf-8")
                # High confidence for successful barcode read
                confidence = 0.95
                return extracted_id, confidence

            return None, 0.0
        except Exception:
            return None, 0.0


class OCRExtractor:
    """Extract ID using OCR as fallback."""

    @staticmethod
    async def extract(image_data: bytes) -> tuple[str | None, float]:
        """
        Extract ID using OCR.
        Returns (extracted_id, confidence) or (None, 0.0) if failed.
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            # Normalize image size before OCR for better consistency
            resample = getattr(Image, "Resampling", None)
            resample_filter = getattr(resample, "LANCZOS", Image.LANCZOS) if resample else Image.LANCZOS
            resized = image.resize((settings.ocr_resize_width, settings.ocr_resize_height), resample=resample_filter)

            # Crop to the ID region of interest (bounds are configurable)
            width, height = resized.size
            left = max(0, min(settings.ocr_roi_left, width))
            top = max(0, min(settings.ocr_roi_top, height))
            right = max(left, min(settings.ocr_roi_right, width))
            bottom = max(top, min(settings.ocr_roi_bottom, height))
            roi = resized.crop((left, top, right, bottom))

            # Use OCR to extract text from the cropped region
            text = pytesseract.image_to_string(roi, config="--psm 6")
            # Clean and extract potential ID (13 characters)
            cleaned_text = "".join(c for c in text if c.isalnum())
            # Look for 13-character sequences
            if len(cleaned_text) >= 13:
                # Try to find a 13-character sequence
                for i in range(len(cleaned_text) - 12):
                    potential_id = cleaned_text[i : i + 13]
                    if len(potential_id) == 13 and potential_id.isalnum():
                        # Lower confidence for OCR
                        confidence = 0.7
                        return potential_id, confidence
            return None, 0.0
        except Exception:
            return None, 0.0


class IDValidator:
    """Validate and parse extracted ID."""

    @staticmethod
    def parse_id(extracted_id: str) -> IDValidationResult:
        """
        Parse 13-character ID into components.
        Format: SCHOOL_CODE(6) + SUBJECT_CODE(4) + TEST_TYPE(1) + SHEET_NUMBER(2)
        """
        if not extracted_id or len(extracted_id) != 13:
            return IDValidationResult(
                is_valid=False,
                error_message=f"ID must be exactly 13 characters, got {len(extracted_id) if extracted_id else 0}",
            )

        if not extracted_id.isalnum():
            return IDValidationResult(is_valid=False, error_message="ID must be alphanumeric")

        school_code = extracted_id[0:6]
        subject_code = extracted_id[6:10]
        test_type = extracted_id[10:11]
        sheet_number = extracted_id[11:13]

        # Validate test type
        if test_type not in ["1", "2"]:
            return IDValidationResult(
                is_valid=False,
                error_message=f"Test type must be 1 (Objectives) or 2 (Essay), got {test_type}",
            )

        # Validate sheet number (01-99)
        try:
            sheet_num = int(sheet_number)
            if sheet_num < 1 or sheet_num > 99:
                return IDValidationResult(
                    is_valid=False,
                    error_message=f"Sheet number must be between 01 and 99, got {sheet_number}",
                )
        except ValueError:
            return IDValidationResult(
                is_valid=False,
                error_message=f"Sheet number must be numeric, got {sheet_number}",
            )

        return IDValidationResult(
            is_valid=True,
            school_code=school_code,
            subject_code=subject_code,
            test_type=test_type,
            sheet_number=sheet_number,
        )

    @staticmethod
    async def validate_against_database(
        session: AsyncSession, validation_result: IDValidationResult
    ) -> tuple[bool, str | None]:
        """
        Validate that school and subject exist and are associated.
        Returns (is_valid, error_message).
        """
        if not validation_result.is_valid:
            return False, validation_result.error_message

        # Check school exists
        school_stmt = select(School).where(School.code == validation_result.school_code)
        result = await session.execute(school_stmt)
        school = result.scalar_one_or_none()
        if not school:
            return False, f"School with code {validation_result.school_code} not found"

        # Check subject exists
        subject_stmt = select(Subject).where(Subject.code == validation_result.subject_code)
        result = await session.execute(subject_stmt)
        subject = result.scalar_one_or_none()
        if not subject:
            return False, f"Subject with code {validation_result.subject_code} not found"

        # Check school-subject association
        association_stmt = select(school_subjects).where(
            school_subjects.c.school_id == school.id, school_subjects.c.subject_id == subject.id
        )
        result = await session.execute(association_stmt)
        association = result.first()
        if not association:
            return (
                False,
                f"School {validation_result.school_code} does not have access to subject {validation_result.subject_code}",
            )

        return True, None

    @staticmethod
    async def check_duplicate_sheet(
        session: AsyncSession,
        school_id: int,
        subject_id: int,
        test_type: str,
        sheet_number: str,
        exclude_document_id: int | None = None,
    ) -> tuple[bool, str | None]:
        """
        Check for duplicate sheet number within same school+subject+test_type.
        Returns (is_duplicate, error_message).
        """
        stmt = select(Document).where(
            Document.school_id == school_id,
            Document.subject_id == subject_id,
            Document.test_type == test_type,
            Document.sheet_number == sheet_number,
        )
        if exclude_document_id:
            stmt = stmt.where(Document.id != exclude_document_id)

        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return (
                True,
                f"Sheet number {sheet_number} already exists for school+subject+test_type combination",
            )
        return False, None


class IDExtractionService:
    """Service for extracting and validating IDs from documents."""

    def __init__(self):
        self.barcode_extractor = BarcodeExtractor()
        self.ocr_extractor = OCRExtractor()
        self.validator = IDValidator()

    async def extract_id(
        self, image_data: bytes, session: AsyncSession, document_id: int | None = None
    ) -> dict[str, Any]:
        """
        Extract ID from image using barcode with OCR fallback.
        Returns extraction result with method, confidence, and parsed components.
        """
        extracted_id = None
        method = None
        confidence = 0.0

        # Try barcode first if enabled
        if settings.barcode_enabled:
            extracted_id, confidence = await self.barcode_extractor.extract(image_data)
            if extracted_id:
                method = ExtractionMethod.BARCODE.value

        # Fallback to OCR if barcode failed and OCR is enabled
        if not extracted_id and settings.ocr_enabled:
            extracted_id, confidence = await self.ocr_extractor.extract(image_data)
            if extracted_id:
                method = ExtractionMethod.OCR.value

        if not extracted_id:
            return {
                "extracted_id": None,
                "method": None,
                "confidence": 0.0,
                "is_valid": False,
                "error_message": "Failed to extract ID using barcode or OCR",
            }

        # Validate ID format
        validation_result = self.validator.parse_id(extracted_id)
        if not validation_result.is_valid:
            return {
                "extracted_id": extracted_id,
                "method": method,
                "confidence": confidence,
                "is_valid": False,
                "error_message": validation_result.error_message,
            }

        # Validate against database
        is_valid, error_message = await self.validator.validate_against_database(session, validation_result)
        if not is_valid:
            return {
                "extracted_id": extracted_id,
                "method": method,
                "confidence": confidence,
                "is_valid": False,
                "error_message": error_message,
            }

        # Get school and subject IDs for duplicate check
        school_stmt = select(School).where(School.code == validation_result.school_code)
        result = await session.execute(school_stmt)
        school = result.scalar_one()

        subject_stmt = select(Subject).where(Subject.code == validation_result.subject_code)
        result = await session.execute(subject_stmt)
        subject = result.scalar_one()

        # Check for duplicate sheet number
        is_duplicate, dup_error = await self.validator.check_duplicate_sheet(
            session, school.id, subject.id, validation_result.test_type, validation_result.sheet_number, document_id
        )
        if is_duplicate:
            return {
                "extracted_id": extracted_id,
                "method": method,
                "confidence": confidence,
                "is_valid": False,
                "error_message": dup_error,
            }

        # Check confidence threshold
        if confidence < settings.min_confidence_threshold:
            return {
                "extracted_id": extracted_id,
                "method": method,
                "confidence": confidence,
                "is_valid": False,
                "error_message": f"Extraction confidence {confidence} below threshold {settings.min_confidence_threshold}",
            }

        return {
            "extracted_id": extracted_id,
            "method": method,
            "confidence": confidence,
            "is_valid": True,
            "school_id": school.id,
            "subject_id": subject.id,
            "school_code": validation_result.school_code,
            "subject_code": validation_result.subject_code,
            "test_type": validation_result.test_type,
            "sheet_number": validation_result.sheet_number,
            "error_message": None,
        }


# Global ID extraction service instance
id_extraction_service = IDExtractionService()
