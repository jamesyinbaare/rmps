export type RecentSchoolEntry = {
  schoolId: string;
  schoolCode: string;
  schoolName: string;
};

const SESSION_PREFIX = "script-control-recent-schools";
const MAX_RECENT = 8;

function storageKey(examId: number, subjectId: number, paperNumber: number): string {
  return `${SESSION_PREFIX}:${examId}:${subjectId}:${paperNumber}`;
}

export function readRecentSchools(
  examId: number,
  subjectId: number,
  paperNumber: number,
): RecentSchoolEntry[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(examId, subjectId, paperNumber));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSchoolEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecentSchool(
  examId: number,
  subjectId: number,
  paperNumber: number,
  entry: RecentSchoolEntry,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const cur = readRecentSchools(examId, subjectId, paperNumber).filter(
      (s) => s.schoolId !== entry.schoolId,
    );
    const next = [entry, ...cur].slice(0, MAX_RECENT);
    sessionStorage.setItem(storageKey(examId, subjectId, paperNumber), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
