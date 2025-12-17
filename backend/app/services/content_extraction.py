import io
from typing import Any

import httpx
import pytesseract
from PIL import Image

from app.config import settings
from app.utils.score_utils import parse_score_value


class FullTextExtractor:
    """Extract full OCR text from document."""

    @staticmethod
    async def extract(image_data: bytes) -> tuple[str, float]:
        """
        Extract full text from image using OCR.
        Returns (full_text, confidence) or (empty string, 0.0) if failed.
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            # Normalize image size before OCR for better consistency
            resample = getattr(Image, "Resampling", None)
            resample_filter = getattr(resample, "LANCZOS", Image.LANCZOS) if resample else Image.LANCZOS
            resized = image.resize((settings.ocr_resize_width, settings.ocr_resize_height), resample=resample_filter)

            # Use OCR to extract text from the entire image
            text = pytesseract.image_to_string(resized, config="--psm 6")
            # Medium confidence for OCR text extraction
            confidence = 0.7
            return text, confidence
        except Exception:
            return "", 0.0


class TableExtractor:
    """Extract tables with raw scores using OCR."""

    @staticmethod
    async def extract(image_data: bytes, test_type: str | None = None) -> tuple[list[dict[str, Any]], float]:
        """
        Extract table data containing raw scores from image using OCR.
        Returns (tables, confidence) where tables is a list of table structures.
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            # Normalize image size before OCR
            resample = getattr(Image, "Resampling", None)
            resample_filter = getattr(resample, "LANCZOS", Image.LANCZOS) if resample else Image.LANCZOS
            resized = image.resize((settings.ocr_resize_width, settings.ocr_resize_height), resample=resample_filter)

            # Use OCR to extract text with structure information
            # Try different PSM modes for better table detection
            ocr_data = pytesseract.image_to_data(resized, output_type=pytesseract.Output.DICT)

            # Parse OCR data to extract table structure
            # This is a simplified implementation - can be enhanced based on actual document structure
            tables = []
            rows = []

            # Group text by rows (based on y-coordinate)
            text_by_row: dict[int, list[tuple[str, int]]] = {}
            for i, text in enumerate(ocr_data.get("text", [])):
                if text.strip():
                    y = ocr_data.get("top", [0])[i]
                    # Group by approximate row (round to nearest 10 pixels)
                    row_key = (y // 10) * 10
                    if row_key not in text_by_row:
                        text_by_row[row_key] = []
                    text_by_row[row_key].append((text.strip(), ocr_data.get("left", [0])[i]))

            # Sort rows by y-coordinate
            sorted_rows = sorted(text_by_row.items())

            # Try to identify table rows (rows with numbers that look like scores)
            for row_y, row_data in sorted_rows:
                # Sort row data by x-coordinate
                row_data_sorted = sorted(row_data, key=lambda x: x[1])
                row_text = " ".join([text for text, _ in row_data_sorted])

                # Look for patterns that indicate a score row (index number + score)
                # This is a simplified pattern - should be adjusted based on actual document format
                if any(char.isdigit() for char in row_text):
                    # Try to extract index_number and raw_score
                    parts = row_text.split()
                    if len(parts) >= 2:
                        # Assume first part is index_number, last numeric part is score
                        index_number = None
                        raw_score = None

                        for part in parts:
                            # Look for index number pattern (alphanumeric, typically longer)
                            if len(part) >= 6 and any(c.isalpha() for c in part):
                                index_number = part
                            # Look for numeric score or absence indicator (no upper limit)
                            try:
                                # Try to parse as score value (handles numeric, "A"/"AA")
                                parsed_score = parse_score_value(part)
                                if parsed_score is not None:
                                    raw_score = parsed_score
                            except ValueError:
                                pass

                        if index_number and raw_score is not None:
                            rows.append(
                                {
                                    "index_number": index_number,
                                    "raw_score": raw_score,  # Stored as string: numeric, "A"/"AA"
                                }
                            )

            if rows:
                tables.append(
                    {
                        "test_type": test_type or "1",
                        "rows": rows,
                    }
                )

            # Medium confidence for OCR table extraction
            confidence = 0.6 if rows else 0.0
            return tables, confidence
        except Exception:
            return [], 0.0


class ReductoExtractor:
    """Extract content using Reducto API."""

    def __init__(self):
        self.api_key = settings.reducto_api_key
        self.api_url = settings.reducto_api_url
        self.enabled = settings.reducto_enabled

    async def extract(self, image_data: bytes, test_type: str | None = None) -> tuple[dict[str, Any], float]:
        """
        Extract content from document using Reducto API.
        Returns (parsed_content, confidence) where parsed_content contains full_text and tables.
        """
        if not self.enabled or not self.api_key:
            return {"full_text": "", "tables": []}, 0.0

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Step 1: Upload document
                upload_response = await client.post(
                    f"{self.api_url}/upload",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"file": ("document.jpg", image_data, "image/jpeg")},
                )
                upload_response.raise_for_status()
                upload_data = upload_response.json()
                document_id = upload_data.get("document_id")

                if not document_id:
                    return {"full_text": "", "tables": []}, 0.0

                # Step 2: Parse document
                parse_response = await client.post(
                    f"{self.api_url}/parse",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"document_id": document_id},
                )
                parse_response.raise_for_status()
                parse_data = parse_response.json()
                full_text = parse_data.get("markdown", "")

                # Step 3: Extract structured data (if schema is configured)
                tables = []
                if settings.reducto_extraction_schema:
                    extract_response = await client.post(
                        f"{self.api_url}/extract",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json={
                            "document_id": document_id,
                            "schema": settings.reducto_extraction_schema,
                            "prompt": settings.reducto_extraction_prompt,
                        },
                    )
                    extract_response.raise_for_status()
                    extract_data = extract_response.json()

                    # Convert extracted data to table format
                    # Reducto returns data matching the schema structure
                    candidates = extract_data.get("candidates", [])
                    if candidates:
                        # Transform candidates to rows format
                        rows = []
                        for candidate in candidates:
                            # Extract and normalize score - handle number, string (A/AA), or None
                            score_value = candidate.get("score")
                            try:
                                # Parse and normalize score value (handles numeric, "A"/"AA", or None)
                                raw_score = parse_score_value(score_value)
                            except ValueError:
                                # Invalid format - set to None
                                raw_score = None

                            row = {
                                "index_number": candidate.get("index_number", ""),
                                "raw_score": raw_score,  # Now stored as string: numeric, "A"/"AA", or None
                                "sn": candidate.get("sn"),
                                "candidate_name": candidate.get("candidate_name"),
                                "attend": candidate.get("attend"),
                                "verify": candidate.get("verify"),
                            }
                            rows.append(row)

                        if rows:
                            tables.append(
                                {
                                    "test_type": test_type or str(extract_data.get("paper", "1")),
                                    "rows": rows,
                                    "metadata": {
                                        "sheet_id": extract_data.get("sheet_id"),
                                        "series": extract_data.get("series"),
                                        "paper": extract_data.get("paper"),
                                        "centre": extract_data.get("centre"),
                                        "subject": extract_data.get("subject"),
                                    },
                                }
                            )
                else:
                    # If no schema, try to extract tables from markdown
                    # This is a simplified implementation
                    lines = full_text.split("\n")
                    current_rows = []
                    for line in lines:
                        # Look for table-like patterns
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                # Try to identify index_number and raw_score
                                index_number = None
                                raw_score = None
                                for part in parts:
                                    if len(part) >= 6 and any(c.isalpha() for c in part):
                                        index_number = part
                                    try:
                                        # Try to parse as score value (handles numeric, "A"/"AA")
                                        parsed_score = parse_score_value(part)
                                        if parsed_score is not None:
                                            raw_score = parsed_score
                                    except ValueError:
                                        pass

                                if index_number and raw_score is not None:
                                    current_rows.append(
                                        {
                                            "index_number": index_number,
                                            "raw_score": raw_score,  # Stored as string: numeric, "A"/"AA"
                                        }
                                    )
                            except Exception:
                                pass

                    if current_rows:
                        tables.append(
                            {
                                "test_type": test_type or "1",
                                "rows": current_rows,
                            }
                        )

                parsed_content = {
                    "full_text": full_text,
                    "tables": tables,
                }

                # High confidence for Reducto API
                confidence = 0.9 if full_text or tables else 0.0
                return parsed_content, confidence

        except Exception:
            # Fallback to empty result
            return {"full_text": "", "tables": []}, 0.0


class ContentExtractionService:
    """Service for extracting content from documents."""

    def __init__(self):
        self.full_text_extractor = FullTextExtractor()
        self.table_extractor = TableExtractor()
        self.reducto_extractor = ReductoExtractor()

    async def extract_content(
        self, image_data: bytes, method: str | None = None, test_type: str | None = None
    ) -> dict[str, Any]:
        """
        Extract content from image using specified method or default.
        Returns extraction result with parsed_content, method, confidence, and validation.
        """
        # Determine extraction method
        if method is None:
            if settings.reducto_enabled and settings.reducto_api_key:
                method = "reducto"
            else:
                method = "ocr"

        parsed_content = {"full_text": "", "tables": []}
        extraction_method = None
        confidence = 0.0
        error_message = None

        try:
            if method == "reducto":
                # Try Reducto first
                parsed_content, confidence = await self.reducto_extractor.extract(image_data, test_type)
                extraction_method = "reducto"

                # If Reducto fails or returns low confidence, fallback to OCR
                if not parsed_content.get("full_text") and not parsed_content.get("tables"):
                    method = "ocr"

            if method == "ocr":
                # Use OCR-based extraction
                full_text, text_confidence = await self.full_text_extractor.extract(image_data)
                tables, table_confidence = await self.table_extractor.extract(image_data, test_type)

                parsed_content = {
                    "full_text": full_text,
                    "tables": tables,
                }
                extraction_method = "ocr"
                # Average confidence of text and table extraction
                confidence = (text_confidence + table_confidence) / 2 if table_confidence > 0 else text_confidence

            # Validate extraction result
            is_valid = bool(parsed_content.get("full_text") or parsed_content.get("tables"))

            if not is_valid:
                error_message = "Failed to extract content from document"

            return {
                "parsed_content": parsed_content,
                "parsing_method": extraction_method,
                "parsing_confidence": confidence,
                "is_valid": is_valid,
                "error_message": error_message,
            }

        except Exception as e:
            return {
                "parsed_content": {"full_text": "", "tables": []},
                "parsing_method": extraction_method,
                "parsing_confidence": 0.0,
                "is_valid": False,
                "error_message": f"Error during content extraction: {str(e)}",
            }


# Create singleton instance
content_extraction_service = ContentExtractionService()
