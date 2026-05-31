import type { ExaminationScriptSeriesConfigRow, SubjectTypeEnum } from "@/lib/api";

export type ScriptControlSubjectTypeFilter = "all" | SubjectTypeEnum;

export const SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS: { value: ScriptControlSubjectTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "CORE", label: "Core" },
  { value: "ELECTIVE", label: "Elective" },
];

export function parseScriptControlSubjectTypeFilter(raw: string | null): ScriptControlSubjectTypeFilter {
  if (raw === "CORE" || raw === "ELECTIVE") return raw;
  return "all";
}

export function filterSeriesConfigBySubjectType(
  items: ExaminationScriptSeriesConfigRow[],
  filter: ScriptControlSubjectTypeFilter,
): ExaminationScriptSeriesConfigRow[] {
  if (filter === "all") return items;
  return items.filter((s) => s.subject_type === filter);
}
