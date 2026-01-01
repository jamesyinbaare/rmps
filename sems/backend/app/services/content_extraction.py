import asyncio
import io
import logging
from typing import Any

import pytesseract
from PIL import Image
from reducto import Reducto
from reducto.types.shared.v3_extract_response import V3ExtractResponse

from app.config import settings
from app.utils.score_utils import parse_score_value

logger = logging.getLogger(__name__)


class FullTextExtractor:
    """Extract full OCR text from document."""

    @staticmethod
    async def extract(image_data: bytes) -> tuple[str, float]:
        """
        Extract full text from image using OCR.
        Returns (full_text, confidence) or (empty string, 0.0) if failed.
        """
        try:
            logger.debug("Starting OCR full text extraction")
            image = Image.open(io.BytesIO(image_data))

            # Normalize image size before OCR for better consistency
            resample = getattr(Image, "Resampling", None)
            resample_filter = getattr(resample, "LANCZOS", Image.LANCZOS) if resample else Image.LANCZOS
            resized = image.resize((settings.ocr_resize_width, settings.ocr_resize_height), resample=resample_filter)

            # Use OCR to extract text from the entire image
            text = pytesseract.image_to_string(resized, config="--psm 6")
            # Medium confidence for OCR text extraction
            confidence = 0.7
            text_length = len(text)
            logger.info(f"OCR full text extraction completed: extracted {text_length} characters, confidence={confidence:.2f}")
            return text, confidence
        except Exception as e:
            logger.error(f"OCR full text extraction failed: {e}", exc_info=True)
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
            logger.debug(f"Starting OCR table extraction (test_type={test_type})")
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
            num_rows = len(rows)
            logger.info(f"OCR table extraction completed: extracted {num_rows} rows, confidence={confidence:.2f}")
            return tables, confidence
        except Exception as e:
            logger.error(f"OCR table extraction failed: {e}", exc_info=True)
            return [], 0.0


class ReductoExtractor:
    """Extract content using Reducto SDK."""

    def __init__(self):
        self.api_key = settings.reducto_api_key
        self.enabled = settings.reducto_enabled
        self._client: Reducto | None = None

    def _get_client(self) -> Reducto:
        """Get or create Reducto client instance."""
        if self._client is None:
            logger.debug("Initializing Reducto client")
            self._client = Reducto(api_key=self.api_key)
            logger.debug("Reducto client initialized")
        return self._client

    async def extract(self, image_data: bytes, test_type: str | None = None) -> tuple[dict[str, Any], float]:
        """
        Extract content from document using Reducto SDK.
        Returns (parsed_content, confidence) where parsed_content contains full_text and tables.
        """
        if not self.enabled:
            logger.warning("Reducto extraction is disabled")
            return {"full_text": "", "tables": []}, 0.0

        if not self.api_key:
            logger.warning("Reducto API key is not configured")
            return {"full_text": "", "tables": []}, 0.0

        try:
            logger.info(f"Starting Reducto extraction (test_type={test_type}, image_size={len(image_data)} bytes)")
            client = self._get_client()

            # Step 1: Upload document from bytes
            # Create a file-like object from bytes for the SDK
            # Run SDK calls in executor since they may be synchronous
            logger.debug("Uploading document to Reducto")
            file_obj = io.BytesIO(image_data)
            upload = await asyncio.to_thread(client.upload, file=file_obj)
            logger.debug("Document uploaded successfully")

            # Step 2: Build reducto:// URL from file_id
            # The upload response contains a file_id. Build a reducto:// URL for input.
            file_id = upload.file_id if hasattr(upload, "file_id") else upload.get("file_id") if isinstance(upload, dict) else None
            if not file_id:
                logger.error("Failed to get file_id from upload response")
                return {"full_text": "", "tables": []}, 0.0

            input_url = f"reducto://{file_id}"
            logger.debug(f"Built input URL: {input_url}")

            # Step 3: Extract structured data using Extract endpoint (which performs Parse first)
            tables = []
            full_text = ""

            if settings.reducto_extraction_schema:
                logger.debug("Extracting structured data with schema using Extract endpoint")
                try:
                    # Extract endpoint performs Parse first, then extracts specific data
                    extract_result = await asyncio.to_thread(
                        client.extract.run,
                        input=input_url,
                        instructions={
                            "schema": settings.reducto_extraction_schema,
                            "system_prompt": settings.reducto_extraction_prompt,
                        },
                        settings={"array_extract": True},
                    )
                    logger.debug("Extract endpoint completed successfully")

                    # Extract endpoint returns V3ExtractResponse with result, usage, job_id, studio_link
                    # result is Union[List[object], object] - typically a list of length 1 if chunking is disabled
                    if isinstance(extract_result, V3ExtractResponse):
                        result = extract_result.result
                    else:
                        # Fallback for other response types
                        result = extract_result.result if hasattr(extract_result, "result") else extract_result

                    # Handle result being a list (default: list of length 1) or a single object
                    if isinstance(result, list):
                        # Get the first element if it's a list (typical case when chunking is disabled)
                        extract_data = result[0] if len(result) > 0 else {}
                        logger.debug(f"Extract result is a list with {len(result)} element(s)")
                    else:
                        extract_data = result if isinstance(result, dict) else {}
                        logger.debug("Extract result is a single object")

                    # Log usage information if available
                    if isinstance(extract_result, V3ExtractResponse):
                        usage = extract_result.usage
                        logger.debug(
                            f"Extract usage: {usage.num_pages} pages, {usage.num_fields} fields, "
                            f"credits={usage.credits}"
                        )
                        if extract_result.job_id:
                            logger.debug(f"Extract job_id: {extract_result.job_id}")
                        if extract_result.studio_link:
                            logger.debug(f"Extract studio_link: {extract_result.studio_link}")

                    # Extract performs Parse first, but full text is not directly in the Extract response
                    # We would need to use Parse separately if we need the full markdown text
                    # For now, full_text remains empty when using Extract endpoint

                    candidates = extract_data.get("candidates", []) if isinstance(extract_data, dict) else []
                    logger.debug(f"Extracted {len(candidates)} candidates from structured data")

                    if candidates:
                        # Transform candidates to rows format
                        rows = []
                        for candidate in candidates:
                            # Extract and normalize score - handle number, string (A/AA), or None
                            score_value = candidate.get("score")
                            try:
                                # Parse and normalize score value (handles numeric, "A"/"AA", or None)
                                raw_score = parse_score_value(score_value)
                            except ValueError as e:
                                logger.debug(f"Failed to parse score value '{score_value}': {e}")
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
                            logger.debug(f"Created table with {len(rows)} rows and metadata")
                    else:
                        logger.warning("No candidates found in extracted data")
                except Exception as e:
                    logger.error(f"Failed to extract structured data with Extract endpoint: {e}", exc_info=True)
                    # Continue with empty tables if extraction fails
            else:
                logger.debug("No extraction schema configured, using Parse endpoint for text extraction")
                # If no schema, use Parse endpoint to get full text
                try:
                    parse_result = await asyncio.to_thread(client.parse.run, input=input_url)
                    full_text = parse_result.get("markdown", "") if isinstance(parse_result, dict) else str(parse_result)
                    logger.debug(f"Document parsed: extracted {len(full_text)} characters")

                    # Try to extract tables from markdown
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
                except Exception as e:
                    logger.error(f"Failed to parse document: {e}", exc_info=True)
                    # Continue with empty full_text if parsing fails

            parsed_content = {
                "full_text": full_text,
                "tables": tables,
            }

            # High confidence for Reducto SDK
            confidence = 0.9 if full_text or tables else 0.0
            num_tables = len(tables)
            total_rows = sum(len(table.get("rows", [])) for table in tables)
            text_length = len(full_text)
            logger.info(
                f"Reducto extraction completed: {text_length} chars, {num_tables} tables, "
                f"{total_rows} rows, confidence={confidence:.2f}"
            )
            return parsed_content, confidence

        except Exception as e:
            logger.error(f"Reducto extraction failed: {e}", exc_info=True)
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
                logger.debug("Method not specified, using 'reducto' (configured default)")
            else:
                method = "ocr"
                logger.debug("Method not specified, using 'ocr' (configured default)")
        else:
            logger.debug(f"Using explicitly specified extraction method: {method}")

        logger.info(f"Starting content extraction: method={method}, test_type={test_type}, image_size={len(image_data)} bytes")

        parsed_content = {"full_text": "", "tables": []}
        extraction_method = None
        confidence = 0.0
        error_message = None

        try:
            if method == "reducto":
                # Use Reducto exclusively
                logger.debug("Using Reducto extraction method")
                parsed_content, confidence = await self.reducto_extractor.extract(image_data, test_type)
                extraction_method = "reducto"
            elif method == "ocr":
                # Use OCR-based extraction
                logger.debug("Using OCR extraction method")
                full_text, text_confidence = await self.full_text_extractor.extract(image_data)
                tables, table_confidence = await self.table_extractor.extract(image_data, test_type)

                parsed_content = {
                    "full_text": full_text,
                    "tables": tables,
                }
                extraction_method = "ocr"
                # Average confidence of text and table extraction
                confidence = (text_confidence + table_confidence) / 2 if table_confidence > 0 else text_confidence
            else:
                logger.warning(f"Unknown extraction method: {method}, falling back to OCR")
                # Fallback to OCR for unknown methods
                full_text, text_confidence = await self.full_text_extractor.extract(image_data)
                tables, table_confidence = await self.table_extractor.extract(image_data, test_type)
                parsed_content = {
                    "full_text": full_text,
                    "tables": tables,
                }
                extraction_method = "ocr"
                confidence = (text_confidence + table_confidence) / 2 if table_confidence > 0 else text_confidence

            # Validate extraction result
            is_valid = bool(parsed_content.get("full_text") or parsed_content.get("tables"))

            if not is_valid:
                error_message = "Failed to extract content from document"
                logger.warning(f"Content extraction completed but result is invalid: method={extraction_method}, confidence={confidence:.2f}")
            else:
                logger.info(
                    f"Content extraction completed successfully: method={extraction_method}, "
                    f"confidence={confidence:.2f}, valid={is_valid}"
                )

            return {
                "parsed_content": parsed_content,
                "parsing_method": extraction_method,
                "parsing_confidence": confidence,
                "is_valid": is_valid,
                "error_message": error_message,
            }

        except Exception as e:
            logger.error(f"Content extraction failed with exception: {e}", exc_info=True)
            return {
                "parsed_content": {"full_text": "", "tables": []},
                "parsing_method": extraction_method,
                "parsing_confidence": 0.0,
                "is_valid": False,
                "error_message": f"Error during content extraction: {str(e)}",
            }


# Create singleton instance
content_extraction_service = ContentExtractionService()
