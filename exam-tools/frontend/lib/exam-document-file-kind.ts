/** Max bytes to fetch for any in-browser thumbnail (image / PDF / text). */
export const EXAM_DOCUMENT_THUMB_FETCH_MAX_BYTES = 8 * 1024 * 1024;

/** Max bytes to read fully for .txt / .csv text thumbnails. */
export const EXAM_DOCUMENT_THUMB_TEXT_MAX_BYTES = 256 * 1024;

export type ExamDocumentThumbContentKind = "image" | "pdf" | "text" | "static";

export function examDocumentThumbContentKind(
  filename: string,
  sizeBytes: number,
): ExamDocumentThumbContentKind {
  if (sizeBytes > EXAM_DOCUMENT_THUMB_FETCH_MAX_BYTES) {
    return "static";
  }
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "" : "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "csv") {
    if (sizeBytes > EXAM_DOCUMENT_THUMB_TEXT_MAX_BYTES) return "static";
    return "text";
  }
  return "static";
}

export type ExamDocumentPlaceholderKind =
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "text"
  | "image"
  | "other";

export function examDocumentPlaceholderKind(filename: string): ExamDocumentPlaceholderKind {
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "" : "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "powerpoint";
  if (["txt", "csv"].includes(ext)) return "text";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "other";
}

export function placeholderLabel(kind: ExamDocumentPlaceholderKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "word":
      return "Word";
    case "excel":
      return "Excel";
    case "powerpoint":
      return "PowerPoint";
    case "text":
      return "Text";
    case "image":
      return "Image";
    default:
      return "File";
  }
}

/** Tailwind gradient stops for thumbnail backgrounds (theme-friendly opacity). */
export function examDocumentThumbnailGradient(kind: ExamDocumentPlaceholderKind): string {
  switch (kind) {
    case "pdf":
      return "from-red-500/20 to-muted";
    case "word":
      return "from-blue-500/20 to-muted";
    case "excel":
      return "from-emerald-500/20 to-muted";
    case "powerpoint":
      return "from-amber-500/20 to-muted";
    case "text":
      return "from-slate-500/20 to-muted";
    case "image":
      return "from-violet-500/20 to-muted";
    default:
      return "from-muted-foreground/15 to-muted";
  }
}

/** Short extension label for the thumbnail (e.g. pdf, xlsx). */
export function fileExtensionDisplay(filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "" : "";
  if (!ext) return "—";
  return ext.length > 10 ? `${ext.slice(0, 10)}…` : ext;
}
