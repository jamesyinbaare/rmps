import type { ExaminerTypeApi, MarkedScriptReturnExaminerOption } from "@/lib/api";
import {
  EXAMINER_TYPE_ABBREVIATIONS,
  EXAMINER_TYPE_LABELS,
} from "@/components/examiner-invitations/constants";
import { REGION_OPTIONS } from "@/lib/school-enums";

export function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function examinerRoleAbbrev(type: string): string {
  return EXAMINER_TYPE_ABBREVIATIONS[type as ExaminerTypeApi] ?? type;
}

export function examinerRoleLabel(type: string): string {
  return EXAMINER_TYPE_LABELS[type as ExaminerTypeApi] ?? type;
}

export function filterExaminersByRegionAndRole(
  examiners: MarkedScriptReturnExaminerOption[],
  regions: string[],
  roles: string[],
): MarkedScriptReturnExaminerOption[] {
  let result = examiners;
  if (regions.length > 0) {
    result = result.filter((e) => regions.includes(e.region));
  }
  if (roles.length > 0) {
    result = result.filter((e) => roles.includes(e.examiner_type));
  }
  return result;
}

export function filterAllocationExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
  query: string,
): MarkedScriptReturnExaminerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return examiners;
  return examiners.filter(
    (e) =>
      e.examiner_name.toLowerCase().includes(q) ||
      e.examiner_type.toLowerCase().includes(q) ||
      regionLabel(e.region).toLowerCase().includes(q),
  );
}

export function sortAllocationExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
): MarkedScriptReturnExaminerOption[] {
  return [...examiners].sort((a, b) =>
    a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" }),
  );
}
