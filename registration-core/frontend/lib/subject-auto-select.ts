import type { ProgrammeSubjectRequirements } from "@/types";
import {
  isStructuredRegistrationType,
  primaryRegistrationType,
} from "@/lib/school-registration";

/** Auto-select compulsory cores + electives for structured types; empty for referral/private. */
export function autoSelectSubjectIds(
  subjects: ProgrammeSubjectRequirements,
  registrationType: string | null | undefined,
  _examSeries?: string | null | undefined,
  allowsFreeTvet?: boolean | null
): number[] {
  const primary = primaryRegistrationType({ allows_free_tvet: allowsFreeTvet });
  const resolved = registrationType || primary;
  if (resolved === "referral" || resolved === "private") {
    return [];
  }
  if (!isStructuredRegistrationType(resolved)) {
    return [];
  }
  return [
    ...subjects.compulsory_core.map((s) => s.subject_id),
    ...subjects.electives.map((s) => s.subject_id),
  ];
}
