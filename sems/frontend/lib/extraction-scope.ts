import type { ExtractionProvider } from "@/types/document";

export const RESUME_STORAGE_KEY = "sems.extraction.resume";
export const COMPLETED_WINDOW_STORAGE_KEY = "sems.extraction.completed_window";

export type ExtractionResumeScope = {
  exam_id: number;
  subject_id: number;
};

export type ExtractionScopeParams = {
  exam_id?: number;
  subject_id?: number;
  provider?: ExtractionProvider;
};

export type CompletedWindow = "15m" | "1h" | "4h" | "today" | "all";

export const DEFAULT_COMPLETED_WINDOW: CompletedWindow = "1h";

export const COMPLETED_WINDOW_OPTIONS: Array<{
  value: CompletedWindow;
  label: string;
}> = [
  { value: "15m", label: "Last 15 min" },
  { value: "1h", label: "Last 1 hour" },
  { value: "4h", label: "Last 4 hours" },
  { value: "today", label: "Today" },
  { value: "all", label: "All" },
];

export function parseOptionalInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parseProvider(value: string | null): ExtractionProvider | undefined {
  if (value === "llama" || value === "reducto") return value;
  return undefined;
}

export function parseCompletedWindow(value: string | null | undefined): CompletedWindow | undefined {
  if (
    value === "15m" ||
    value === "1h" ||
    value === "4h" ||
    value === "today" ||
    value === "all"
  ) {
    return value;
  }
  return undefined;
}

export function readResumeScope(): ExtractionResumeScope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtractionResumeScope;
    if (typeof parsed?.exam_id === "number" && typeof parsed?.subject_id === "number") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function writeResumeScope(examId: number, subjectId: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RESUME_STORAGE_KEY,
      JSON.stringify({ exam_id: examId, subject_id: subjectId } satisfies ExtractionResumeScope)
    );
  } catch {
    // ignore
  }
}

export function clearResumeScope() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readCompletedWindow(): CompletedWindow | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCompletedWindow(window.localStorage.getItem(COMPLETED_WINDOW_STORAGE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export function writeCompletedWindow(windowValue: CompletedWindow) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPLETED_WINDOW_STORAGE_KEY, windowValue);
  } catch {
    // ignore
  }
}

/** Earliest timestamp still inside the completed window (null = no cutoff / All). */
export function completedWindowCutoff(windowValue: CompletedWindow, now = new Date()): Date | null {
  if (windowValue === "all") return null;
  if (windowValue === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const ms =
    windowValue === "15m"
      ? 15 * 60 * 1000
      : windowValue === "1h"
        ? 60 * 60 * 1000
        : 4 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export function appendScopeToHref(
  href: string,
  scope: ExtractionScopeParams | null | undefined
): string {
  if (!scope) return href;
  const [path, existingQuery = ""] = href.split("?");
  const params = new URLSearchParams(existingQuery);
  if (scope.exam_id != null) params.set("exam_id", String(scope.exam_id));
  if (scope.subject_id != null) params.set("subject_id", String(scope.subject_id));
  if (scope.provider) params.set("provider", scope.provider);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
