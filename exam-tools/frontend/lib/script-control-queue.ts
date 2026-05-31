import {
  getIrregularScriptControlSchoolStatus,
  getScriptControlSchoolStatus,
  type ScriptControlSchoolOverallStatus,
  type ScriptControlSchoolStatusParams,
} from "@/lib/api";
import {
  buildSubjectCompletion,
  filterSubjectsByEditStatus,
  subjectEditStatus,
  type SubjectEditStatusFilter,
} from "@/lib/script-control-completion";
import type { ScriptSubjectRowResponse } from "@/lib/api";

export type QueueContext = {
  examinationId: number;
  subjectId: number;
  paperNumber: number;
  schoolId: string;
  recordType: "regular" | "irregular";
  statusFilter: ScriptControlSchoolOverallStatus | "all";
};

export function nextSubjectInSchool(
  subjects: ScriptSubjectRowResponse[],
  currentSubjectId: number,
  filter: SubjectEditStatusFilter,
  todayIso: string,
): number | null {
  const filtered = filterSubjectsByEditStatus(subjects, filter, todayIso);
  if (filtered.length === 0) return null;
  const idx = filtered.findIndex((s) => s.subject_id === currentSubjectId);
  const next = idx >= 0 ? filtered[idx + 1] : filtered[0];
  return next?.subject_id ?? null;
}

export function subjectStillNeedsWork(
  subject: ScriptSubjectRowResponse,
  todayIso: string,
): boolean {
  return subjectEditStatus(buildSubjectCompletion(subject, todayIso)) === "needs_work";
}

export async function findNextQueueSchool(ctx: QueueContext): Promise<string | null> {
  const status: ScriptControlSchoolOverallStatus | "all" =
    ctx.statusFilter === "all" ? "missing" : ctx.statusFilter;

  const base: ScriptControlSchoolStatusParams = {
    examination_id: ctx.examinationId,
    subject_id: ctx.subjectId,
    paper_number: ctx.paperNumber,
    status,
    skip: 0,
    limit: 200,
  };

  const fetchPage =
    ctx.recordType === "regular"
      ? getScriptControlSchoolStatus
      : getIrregularScriptControlSchoolStatus;

  let skip = 0;
  let passedCurrent = false;

  for (let page = 0; page < 20; page++) {
    const res = await fetchPage({ ...base, skip, limit: 200 });
    if (res.items.length === 0) break;

    for (const row of res.items) {
      if (row.school_id === ctx.schoolId) {
        passedCurrent = true;
        continue;
      }
      if (passedCurrent && (row.overall_status === "missing" || row.overall_status === "partial")) {
        return row.school_id;
      }
    }

    if (!passedCurrent) {
      const idx = res.items.findIndex((r) => r.school_id === ctx.schoolId);
      if (idx >= 0) {
        for (let i = idx + 1; i < res.items.length; i++) {
          const row = res.items[i];
          if (row.overall_status === "missing" || row.overall_status === "partial") {
            return row.school_id;
          }
        }
        passedCurrent = true;
      }
    }

    skip += res.items.length;
    if (skip >= res.total) break;
  }

  if (status !== "partial") {
    return findNextQueueSchool({ ...ctx, statusFilter: "partial" });
  }

  return null;
}
