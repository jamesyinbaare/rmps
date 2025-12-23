from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Storage settings
    storage_backend: str = "local"  # local, s3, azure
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    # PDF generation settings
    templates_path: str = "templates"  # Path to HTML templates directory
    pdf_output_path: str = "score_sheets"  # Path to save generated PDF score sheets
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
    # Reducto API settings
    reducto_enabled: bool = True
    reducto_api_key: str | None = None
    reducto_api_url: str = "https://api.reducto.ai"
    reducto_extraction_prompt: str = (
        "Extract examination score data from this document. "
        "Focus on the main score table containing candidate information. "
        "For each candidate row, extract: serial number (sn), index number, candidate name, "
        "attendance (check mark for present, 'A' or 'AA' for absent), score (any positive number or 'A'/'AA' for absent), "
        "and verification score (any positive number or 'A'/'AA' for absent). "
        "Note: Scores can be any positive number and are not limited to 100. "
        "Also extract sheet metadata: sheet_id, series, paper/test type, centre, and subject. "
        "Preserve exact values as they appear in the document, including check marks and absence indicators."
    )
    reducto_extraction_schema: dict | None = {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "description": "List of candidates examination scores in a table. Extract all rows from the score table, including candidates who were absent.",
                "items": {
                    "type": "object",
                    "properties": {
                        "sn": {
                            "type": "number",
                            "description": "Candidate serial number or row number in the table.",
                        },
                        "index_number": {
                            "type": "string",
                            "description": "Candidate index number (alphanumeric identifier).",
                        },
                        "candidate_name": {
                            "type": "string",
                            "description": "Candidate full name as written on the examination sheet.",
                        },
                        "attend": {
                            "type": "string",
                            "description": "Attendance indicator. Extract the exact value as it appears: a check mark (✓, ✔, √, X, or any mark/symbol) indicates the candidate attended and should be extracted as-is, 'A' or 'AA' indicates absence. Preserve the exact symbol or text found in the document without conversion.",
                        },
                        "score": {
                            "oneOf": [
                                {
                                    "type": "number",
                                    "description": "Candidate examination score as a numeric value. Can be any positive number (no upper limit).",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Absence indicator. Use 'A' or 'AA' if the candidate was absent (no score available).",
                                },
                            ],
                            "description": "Candidate examination score. Can be any positive number or 'A'/'AA' for absent candidates.",
                        },
                        "verify": {
                            "oneOf": [
                                {
                                    "type": "number",
                                    "description": "Verification score (duplicate of score field for verification purposes). Can be any positive number (no upper limit).",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Absence indicator. Use 'A' or 'AA' if the candidate was absent (no verification score available).",
                                },
                            ],
                            "description": "Verification score (repeated score for verification). Can be any positive number or 'A'/'AA' for absent candidates.",
                        },
                    },
                    "required": ["sn", "index_number", "attend", "score"],
                },
            },
            "sheet_id": {
                "type": "string",
                "description": "Unique identifier for the examination sheet (usually found in the header or barcode area).",
            },
            "series": {
                "type": "number",
                "description": "The series number or subject series (e.g., 1, 2, 3, etc.).",
            },
            "paper": {
                "type": "number",
                "description": "The paper number or test type (1 = Objectives, 2 = Essay, 3 = Practicals).",
            },
            "centre": {
                "type": "string",
                "description": "The examination centre name or code.",
            },
            "subject": {
                "type": "string",
                "description": "The subject code and name (e.g., '701 Mathematics' or '701 - Mathematics').",
            },
        },
        "required": ["candidates"],
    }  # Schema for structured data extraction


settings = Settings()  # type: ignore
