import { parseMonitoringExamIdFromUrl } from "@/lib/monitoring-access";

export const EXECUTIVE_EXAM_ID_PARAM = "exam_id";

export const EXECUTIVE_MONITORING_HREF = "/dashboard/admin/monitoring";
export const EXECUTIVE_CENTRES_HREF = `${EXECUTIVE_MONITORING_HREF}/centres`;

const SESSION_KEY = "executive-cache:v1:selected-exam-id";

export function readExecutiveSelectedExamId(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw == null || raw.trim() === "") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function writeExecutiveSelectedExamId(id: number | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (id == null) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, String(id));
  } catch {
    /* quota or private mode */
  }
}

type ExamListItem = { id: number };

/** URL → previous state → session → staff default → first list item. */
export function resolveExecutiveExamId(options: {
  exams: ExamListItem[];
  fromUrl: number | null;
  previous: number | null;
  defaultExam: ExamListItem | null;
}): number | null {
  const { exams, fromUrl, previous, defaultExam } = options;
  if (fromUrl != null && exams.some((e) => e.id === fromUrl)) return fromUrl;
  if (previous != null && exams.some((e) => e.id === previous)) return previous;
  const fromSession = readExecutiveSelectedExamId();
  if (fromSession != null && exams.some((e) => e.id === fromSession)) return fromSession;
  if (defaultExam != null && exams.some((e) => e.id === defaultExam.id)) return defaultExam.id;
  return exams.length ? exams[0]!.id : null;
}

export function executiveMonitoringHref(
  base: string,
  rawExamIdFromUrl: string | null,
): string {
  const fromUrl = parseMonitoringExamIdFromUrl(rawExamIdFromUrl);
  const id = fromUrl ?? readExecutiveSelectedExamId();
  if (id == null) return base;
  const p = new URLSearchParams();
  p.set(EXECUTIVE_EXAM_ID_PARAM, String(id));
  return `${base}?${p.toString()}`;
}
