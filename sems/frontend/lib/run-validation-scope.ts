import { runValidation } from "@/lib/api";
import type { Subject } from "@/types/document";

export type ValidationScopeFailure = {
  subject_id: number;
  subject_code?: string;
  message: string;
};

export type AggregatedValidationResult = {
  subjectsSucceeded: number;
  subjectsFailed: number;
  total_scores_checked: number;
  issues_found: number;
  issues_created: number;
  issues_resolved: number;
  issues_reopened: number;
  failures: ValidationScopeFailure[];
};

export type ValidationProgressUpdate = {
  current: number;
  total: number;
  label: string;
  subjectId: number | null;
  phase: "start" | "complete" | "error";
};

export type RunValidationScopeParams = {
  examId: number;
  subjectIds: number[];
  schoolId?: number | null;
  subjectType?: "CORE" | "ELECTIVE" | null;
  testTypes?: number[];
  subjects?: Subject[];
  onProgress?: (update: ValidationProgressUpdate) => void;
};

export async function runValidationForScope(
  params: RunValidationScopeParams
): Promise<AggregatedValidationResult> {
  const {
    examId,
    subjectIds,
    schoolId,
    subjectType,
    testTypes,
    subjects = [],
    onProgress,
  } = params;

  const codesById = new Map(subjects.map((s) => [s.id, s.code]));
  const failures: ValidationScopeFailure[] = [];
  let total_scores_checked = 0;
  let issues_found = 0;
  let issues_created = 0;
  let issues_resolved = 0;
  let issues_reopened = 0;
  let subjectsSucceeded = 0;

  const subjectRuns =
    subjectIds.length > 0 ? subjectIds : ([null] as Array<number | null>);

  for (let i = 0; i < subjectRuns.length; i++) {
    const subjectId = subjectRuns[i];
    const label = subjectId != null ? codesById.get(subjectId) ?? String(subjectId) : "All subjects";
    onProgress?.({
      current: i + 1,
      total: subjectRuns.length,
      label,
      subjectId,
      phase: "start",
    });

    try {
      const result = await runValidation({
        exam_id: examId,
        school_id: schoolId ?? null,
        subject_id: subjectId,
        subject_type: subjectType ?? null,
        test_types: testTypes?.length ? testTypes : null,
      });
      subjectsSucceeded += 1;
      total_scores_checked += result.total_scores_checked;
      issues_found += result.issues_found;
      issues_created += result.issues_created;
      issues_resolved += result.issues_resolved;
      issues_reopened += result.issues_reopened ?? 0;
      onProgress?.({
        current: i + 1,
        total: subjectRuns.length,
        label,
        subjectId,
        phase: "complete",
      });
    } catch (err) {
      failures.push({
        subject_id: subjectId ?? 0,
        subject_code: subjectId != null ? codesById.get(subjectId) : undefined,
        message: err instanceof Error ? err.message : "Validation failed",
      });
      onProgress?.({
        current: i + 1,
        total: subjectRuns.length,
        label,
        subjectId,
        phase: "error",
      });
    }
  }

  return {
    subjectsSucceeded,
    subjectsFailed: failures.length,
    total_scores_checked,
    issues_found,
    issues_created,
    issues_resolved,
    issues_reopened,
    failures,
  };
}
