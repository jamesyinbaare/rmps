/** ID extraction failure codes returned by the API. */
export type IdExtractionErrorCode =
  | "no_id"
  | "invalid_format"
  | "validation"
  | "duplicate"
  | "low_confidence"
  | "file_missing"
  | "exception";

export const ID_EXTRACTION_ERROR_FILTERS: {
  value: IdExtractionErrorCode | "";
  label: string;
}[] = [
  { value: "", label: "All errors" },
  { value: "no_id", label: "No ID" },
  { value: "duplicate", label: "Duplicate" },
  { value: "invalid_format", label: "Invalid format" },
  { value: "validation", label: "Validation" },
  { value: "low_confidence", label: "Low confidence" },
  { value: "file_missing", label: "File missing" },
  { value: "exception", label: "Other" },
];

export function getIdExtractionErrorBadgeLabel(
  code: string | null | undefined
): string {
  switch (code) {
    case "no_id":
      return "No ID";
    case "duplicate":
      return "Duplicate";
    case "invalid_format":
      return "Invalid";
    case "validation":
      return "Validation";
    case "low_confidence":
      return "Low conf.";
    case "file_missing":
      return "Missing file";
    case "exception":
      return "Failed";
    default:
      return "Failed";
  }
}

export function getIdExtractionErrorTitle(
  code: string | null | undefined
): string {
  switch (code) {
    case "no_id":
      return "Could not extract ID";
    case "duplicate":
      return "Duplicate sheet ID";
    case "invalid_format":
      return "Invalid ID format";
    case "validation":
      return "ID validation failed";
    case "low_confidence":
      return "Low extraction confidence";
    case "file_missing":
      return "File missing from storage";
    case "exception":
      return "Extraction error";
    default:
      return "ID extraction failed";
  }
}
