import asyncio
import io
import logging
import time
import uuid
from typing import Any

import pytesseract
from PIL import Image
from reducto import Reducto
from reducto.types.shared.v3_extract_response import V3ExtractResponse

from app.config import settings
from app.services.reducto_rate_limiter import ReductoRateLimiter
from app.utils.score_utils import parse_score_value

logger = logging.getLogger(__name__)

STRUCTURED_EXTRACTION_METHODS = frozenset({"reducto", "llama"})


def extraction_provider_error(method: str) -> str | None:
    """Return a user-facing error if the provider is unavailable, else None."""
    if method == "reducto":
        if not settings.reducto_enabled:
            return "Reducto extraction is disabled"
        if not settings.reducto_api_key:
            return "Reducto API key is not configured"
        return None
    if method == "llama":
        if not settings.llama_extract_enabled:
            return "Llama Extract is disabled"
        if not settings.llama_cloud_api_key:
            return "Llama Cloud API key is not configured"
        return None
    if method == "ocr":
        return None
    return f"Unknown extraction method: {method}"


def unwrap_extract_data(result: Any) -> dict[str, Any]:
    """Normalize provider extract payloads (dict, list, or model) to a dict."""
    if result is None:
        return {}
    if hasattr(result, "model_dump") and not isinstance(result, dict):
        try:
            result = result.model_dump()
        except Exception:
            result = getattr(result, "__dict__", result)
    if isinstance(result, list):
        first = result[0] if result else {}
        return first if isinstance(first, dict) else {}
    if isinstance(result, dict):
        return result
    return {}


def transform_candidates_to_tables(
    extract_data: dict[str, Any],
    test_type: str | None = None,
) -> list[dict[str, Any]]:
    """Map structured extract JSON (candidates[]) to scores_extraction_data tables."""
    candidates = extract_data.get("candidates") or []
    if not isinstance(candidates, list) or not candidates:
        return []

    rows: list[dict[str, Any]] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        score_value = candidate.get("score")
        verify_value = candidate.get("verify")
        try:
            raw_score = parse_score_value(score_value)
        except ValueError as e:
            logger.debug(f"Failed to parse score value '{score_value}': {e}")
            raw_score = None
        try:
            verify = parse_score_value(verify_value)
        except ValueError as e:
            logger.debug(f"Failed to parse verify value '{verify_value}': {e}")
            verify = None
        rows.append(
            {
                "index_number": candidate.get("index_number", ""),
                "raw_score": raw_score,
                "sn": candidate.get("sn"),
                "candidate_name": candidate.get("candidate_name"),
                "attend": candidate.get("attend"),
                "verify": verify,
            }
        )

    if not rows:
        return []

    return [
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
    ]


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
        self._rate_limiter: ReductoRateLimiter | None = None

    def _get_client(self) -> Reducto:
        """Get or create Reducto client instance."""
        if self._client is None:
            logger.debug("Initializing Reducto client")
            self._client = Reducto(api_key=self.api_key)
            logger.debug("Reducto client initialized")
        return self._client

    def _get_rate_limiter(self) -> ReductoRateLimiter:
        """Get or create rate limiter instance."""
        if self._rate_limiter is None:
            logger.debug(f"Initializing Reducto rate limiter (rate={settings.reducto_rate_limit_per_second} req/s)")
            self._rate_limiter = ReductoRateLimiter(settings.reducto_rate_limit_per_second)
            logger.debug("Reducto rate limiter initialized")
        return self._rate_limiter

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
            rate_limiter = self._get_rate_limiter()
            await rate_limiter.acquire()
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
                    await rate_limiter.acquire()
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

                    extract_data = unwrap_extract_data(result)
                    logger.debug(
                        "Extract result unwrapped: %s keys",
                        list(extract_data.keys()) if extract_data else "empty",
                    )

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

                    tables = transform_candidates_to_tables(extract_data, test_type)
                    if tables:
                        logger.debug(
                            "Created table with %s rows and metadata",
                            len(tables[0].get("rows", [])),
                        )
                    else:
                        logger.warning("No candidates found in extracted data")
                except Exception as e:
                    logger.error(f"Failed to extract structured data with Extract endpoint: {e}", exc_info=True)
                    # Continue with empty tables if extraction fails
            else:
                logger.debug("No extraction schema configured, using Parse endpoint for text extraction")
                # If no schema, use Parse endpoint to get full text
                try:
                    await rate_limiter.acquire()
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


def _job_status_name(job: Any) -> str:
    """Normalize SDK enum/string job status to an uppercase name."""
    raw = getattr(job, "status", job)
    return str(raw).rsplit(".", 1)[-1].upper()


class LlamaExtractExtractor:
    """Extract content using LlamaCloud Llama Extract v2."""

    def __init__(self) -> None:
        self.api_key = settings.llama_cloud_api_key
        self.enabled = settings.llama_extract_enabled
        self._client: Any = None
        self._rate_limiter: ReductoRateLimiter | None = None

    def _get_client(self) -> Any:
        if self._client is None:
            from llama_cloud import LlamaCloud

            logger.debug("Initializing LlamaCloud client")
            self._client = LlamaCloud(api_key=self.api_key)
        return self._client

    def _get_rate_limiter(self) -> ReductoRateLimiter:
        if self._rate_limiter is None:
            logger.debug(
                "Initializing Llama Extract rate limiter (rate=%s req/s)",
                settings.llama_extract_rate_limit_per_second,
            )
            self._rate_limiter = ReductoRateLimiter(settings.llama_extract_rate_limit_per_second)
        return self._rate_limiter

    def _file_id(self, file_obj: Any) -> str | None:
        file_id = getattr(file_obj, "id", None) or getattr(file_obj, "file_id", None)
        if file_id:
            return str(file_id)
        if isinstance(file_obj, dict):
            value = file_obj.get("id") or file_obj.get("file_id")
            return str(value) if value else None
        return None

    async def extract(self, image_data: bytes, test_type: str | None = None) -> tuple[dict[str, Any], float]:
        """
        Extract content from document using Llama Extract.
        Returns (parsed_content, confidence) where parsed_content contains full_text and tables.
        """
        empty: dict[str, Any] = {"full_text": "", "tables": []}
        if not self.enabled:
            logger.warning("Llama Extract is disabled")
            return empty, 0.0
        if not self.api_key:
            logger.warning("Llama Cloud API key is not configured")
            return empty, 0.0
        if not settings.reducto_extraction_schema:
            logger.warning("Extraction schema is not configured")
            return empty, 0.0

        try:
            logger.info(
                "Starting Llama Extract (test_type=%s, image_size=%s bytes)",
                test_type,
                len(image_data),
            )
            client = self._get_client()
            rate_limiter = self._get_rate_limiter()

            await rate_limiter.acquire()
            # Llama Cloud unique-constrains (project_id, data_source_id, external_file_id).
            upload_id = uuid.uuid4().hex
            file_obj = await asyncio.to_thread(
                client.files.create,
                file=(f"{upload_id}.jpg", image_data, "image/jpeg"),
                purpose="extract",
                external_file_id=upload_id,
            )
            file_id = self._file_id(file_obj)
            if not file_id:
                logger.error("Failed to get file id from Llama Cloud upload")
                return empty, 0.0

            await rate_limiter.acquire()
            job = await asyncio.to_thread(
                client.extract.create,
                file_input=file_id,
                configuration={
                    "data_schema": settings.reducto_extraction_schema,
                    "extraction_target": "per_doc",
                    "tier": settings.llama_extract_tier,
                    "system_prompt": settings.reducto_extraction_prompt,
                },
            )

            deadline = time.monotonic() + settings.llama_extract_poll_timeout_seconds
            status_name = _job_status_name(job)
            while status_name not in {"COMPLETED", "FAILED", "CANCELLED"}:
                if time.monotonic() >= deadline:
                    logger.error("Llama Extract timed out waiting for job %s", getattr(job, "id", None))
                    return empty, 0.0
                await asyncio.sleep(settings.llama_extract_poll_interval_seconds)
                job_id = str(getattr(job, "id", "") or "")
                if not job_id:
                    logger.error("Llama Extract job is missing an id")
                    return empty, 0.0
                job = await asyncio.to_thread(client.extract.get, job_id)
                status_name = _job_status_name(job)

            if status_name != "COMPLETED":
                error_message = getattr(job, "error_message", None) or status_name
                logger.error("Llama Extract job failed: %s", error_message)
                return empty, 0.0

            extract_data = unwrap_extract_data(getattr(job, "extract_result", None))
            tables = transform_candidates_to_tables(extract_data, test_type)
            parsed_content: dict[str, Any] = {"full_text": "", "tables": tables}
            confidence = 0.9 if tables else 0.0
            total_rows = sum(len(table.get("rows", [])) for table in tables)
            logger.info(
                "Llama Extract completed: %s tables, %s rows, confidence=%.2f",
                len(tables),
                total_rows,
                confidence,
            )
            return parsed_content, confidence
        except Exception as e:
            logger.error(f"Llama Extract failed: {e}", exc_info=True)
            return empty, 0.0


class ContentExtractionService:
    """Service for extracting content from documents."""

    def __init__(self):
        self.full_text_extractor = FullTextExtractor()
        self.table_extractor = TableExtractor()
        self.reducto_extractor = ReductoExtractor()
        self.llama_extractor = LlamaExtractExtractor()

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

        parsed_content: dict[str, Any] = {"full_text": "", "tables": []}
        extraction_method = method
        confidence = 0.0
        error_message = None

        try:
            if method == "reducto":
                logger.debug("Using Reducto extraction method")
                parsed_content, confidence = await self.reducto_extractor.extract(image_data, test_type)
                extraction_method = "reducto"
            elif method == "llama":
                logger.debug("Using Llama Extract method")
                parsed_content, confidence = await self.llama_extractor.extract(image_data, test_type)
                extraction_method = "llama"
            elif method == "ocr":
                logger.debug("Using OCR extraction method")
                full_text, text_confidence = await self.full_text_extractor.extract(image_data)
                tables, table_confidence = await self.table_extractor.extract(image_data, test_type)

                parsed_content = {
                    "full_text": full_text,
                    "tables": tables,
                }
                extraction_method = "ocr"
                confidence = (text_confidence + table_confidence) / 2 if table_confidence > 0 else text_confidence
            else:
                logger.warning(f"Unknown extraction method: {method}")
                return {
                    "parsed_content": {"full_text": "", "tables": [], "provider": method},
                    "parsing_method": method,
                    "parsing_confidence": 0.0,
                    "is_valid": False,
                    "error_message": f"Unknown extraction method: {method}",
                }

            if isinstance(parsed_content, dict):
                parsed_content = {**parsed_content, "provider": extraction_method}

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
                "parsed_content": {"full_text": "", "tables": [], "provider": extraction_method},
                "parsing_method": extraction_method,
                "parsing_confidence": 0.0,
                "is_valid": False,
                "error_message": f"Error during content extraction: {str(e)}",
            }


# Create singleton instance
content_extraction_service = ContentExtractionService()
