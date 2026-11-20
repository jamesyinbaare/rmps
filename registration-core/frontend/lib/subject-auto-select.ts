import type { ProgrammeSubjectRequirements } from "@/types";
import {
  isMayJuneSeries,
  isStructuredRegistrationType,
  primaryRegistrationType,
} from "@/lib/school-registration";

/** Auto-select subjects for structured school types; empty for referral. */
export function autoSelectSubjectIds(
  subjects: ProgrammeSubjectRequirements,
  registrationType: string | null | undefined,
  examSeries: string | null | undefined,
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
  const ids = subjects.compulsory_core.map((s) => s.subject_id);
  if (isMayJuneSeries(examSeries)) {
    ids.push(...subjects.electives.map((s) => s.subject_id));
  }
  return ids;
}
