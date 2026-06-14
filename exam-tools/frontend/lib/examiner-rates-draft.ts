import type {
  ExaminerAllowanceSubjectRef,
  ExaminerAllowanceTypeApi,
  ExaminerMarkingRateRow,
  ExaminerRoleAllowanceRateCell,
  ExaminerTravelRateRow,
  ExaminerTravelRoleFactorRow,
  ExaminerTravelZoneRow,
  ExaminerTypeApi,
  ExaminationExaminerMarkingRatesResponse,
  ExaminationExaminerRoleAllowanceRatesResponse,
  ExaminationExaminerTravelRatesResponse,
  SubjectTypeEnum,
} from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";

export { SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS, type ScriptControlSubjectTypeFilter };

const EXAMINER_ROLE_TYPES: ExaminerTypeApi[] = [
  "chief_examiner",
  "assistant_chief_examiner",
  "assistant_examiner",
  "team_leader",
];

export const EXAMINER_ALLOWANCE_TYPE_OPTIONS: { value: ExaminerAllowanceTypeApi; label: string }[] = [
  { value: "responsibility_allowance", label: "Responsibility allowance" },
  { value: "inconvenience_allowance", label: "Inconvenience allowance" },
  { value: "chief_examiners_report", label: "Chief Examiner's Report" },
  { value: "vetting_of_scripts", label: "Vetting of Scripts" },
  { value: "internal_commuting", label: "Internal Commuting" },
];

export const EXAMINER_MARKING_TAB = "marking" as const;
export const EXAMINER_TRAVEL_TAB = "travel_and_transport" as const;

export type ExaminerRatesTab =
  | ExaminerAllowanceTypeApi
  | typeof EXAMINER_MARKING_TAB
  | typeof EXAMINER_TRAVEL_TAB;

export type RoleRateDraft = Record<string, string>;
export type MarkingRateDraft = Record<string, string>;
export type TravelRateDraft = Record<string, string>;
export type TravelZoneDraft = { id: string; name: string; regions: string[] }[];
export type TravelRoleFactorDraft = Record<string, string>;

export function travelRoleZoneFactorKey(role: ExaminerTypeApi, zoneId: string): string {
  return `${role}|${zoneId}`;
}

export function parseTravelRoleZoneFactorKey(key: string): {
  examiner_type: ExaminerTypeApi;
  zone_id: string;
} {
  const [examiner_type, zone_id] = key.split("|");
  return {
    examiner_type: examiner_type as ExaminerTypeApi,
    zone_id,
  };
}

export function newTravelZoneId(): string {
  return crypto.randomUUID();
}

export function markingCellKey(subjectId: number, paperNumber: number): string {
  return `${subjectId}|${paperNumber}`;
}

export function parseMarkingCellKey(key: string): { subject_id: number; paper_number: number } {
  const [subjectIdRaw, paperNumberRaw] = key.split("|");
  return {
    subject_id: Number(subjectIdRaw),
    paper_number: Number(paperNumberRaw),
  };
}

export function filterMarkingSubjects(
  subjects: ExaminerAllowanceSubjectRef[],
  filter: ScriptControlSubjectTypeFilter,
): ExaminerAllowanceSubjectRef[] {
  if (filter === "all") return subjects;
  return subjects.filter((s) => s.subject_type === filter);
}

export function filterMarkingSubjectsBySearch(
  subjects: ExaminerAllowanceSubjectRef[],
  query: string,
): ExaminerAllowanceSubjectRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return subjects;
  return subjects.filter(
    (s) =>
      (s.code || "").toLowerCase().includes(q) ||
      (s.name || "").toLowerCase().includes(q),
  );
}

export function filterRegionOptionsBySearch<T extends { value: string; label: string }>(
  regions: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...regions];
  return regions.filter(
    (r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q),
  );
}

export function subjectTypeLabel(subjectType: SubjectTypeEnum): string {
  return subjectType === "CORE" ? "Core" : "Elective";
}

export function roleCellKey(allowanceType: ExaminerAllowanceTypeApi, examinerType: ExaminerTypeApi): string {
  return `${allowanceType}|${examinerType}`;
}

export function parseRoleCellKey(key: string): {
  allowance_type: ExaminerAllowanceTypeApi;
  examiner_type: ExaminerTypeApi;
} {
  const [allowance_type, examiner_type] = key.split("|");
  return {
    allowance_type: allowance_type as ExaminerAllowanceTypeApi,
    examiner_type: examiner_type as ExaminerTypeApi,
  };
}

function normalizeAmount(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return t;
  return n.toFixed(2);
}

export function roleRatesFromApi(data: ExaminationExaminerRoleAllowanceRatesResponse): RoleRateDraft {
  const draft: RoleRateDraft = {};
  for (const cell of data.items) {
    const key = roleCellKey(cell.allowance_type, cell.examiner_type);
    draft[key] = cell.amount_ghs ?? "";
  }
  return draft;
}

export function markingRatesFromApi(data: ExaminationExaminerMarkingRatesResponse): MarkingRateDraft {
  const draft: MarkingRateDraft = {};
  for (const row of data.items) {
    draft[markingCellKey(row.subject_id, row.paper_number)] = row.rate_per_script_ghs ?? "";
  }
  return draft;
}

export function travelRatesFromApi(data: ExaminationExaminerTravelRatesResponse): TravelRateDraft {
  const draft: TravelRateDraft = {};
  for (const row of data.items) {
    draft[row.region] = row.amount_ghs ?? "";
  }
  return draft;
}

export function travelZonesFromApi(data: ExaminationExaminerTravelRatesResponse): TravelZoneDraft {
  return data.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    regions: [...zone.regions],
  }));
}

export function travelRoleFactorsFromApi(
  data: ExaminationExaminerTravelRatesResponse,
): TravelRoleFactorDraft {
  const draft: TravelRoleFactorDraft = {};
  for (const row of data.role_factors) {
    draft[travelRoleZoneFactorKey(row.examiner_type, row.zone_id)] = row.factor ?? "";
  }
  return draft;
}

export function regionZoneAssignmentFromZones(zones: TravelZoneDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const zone of zones) {
    for (const region of zone.regions) {
      out[region] = zone.id;
    }
  }
  return out;
}

export function applyRegionZoneAssignment(
  zones: TravelZoneDraft,
  region: string,
  zoneId: string,
): TravelZoneDraft {
  return zones.map((zone) => {
    const withoutRegion = zone.regions.filter((r) => r !== region);
    if (zoneId && zone.id === zoneId) {
      return { ...zone, regions: [...withoutRegion, region].sort() };
    }
    return { ...zone, regions: withoutRegion };
  });
}

export function serializeExaminerRatesDraft(
  roleRates: RoleRateDraft,
  markingRates: MarkingRateDraft,
  travelRates: TravelRateDraft,
  travelZones: TravelZoneDraft,
  travelRoleFactors: TravelRoleFactorDraft,
): string {
  const normalizedRole: RoleRateDraft = {};
  for (const [key, raw] of Object.entries(roleRates)) {
    normalizedRole[key] = normalizeAmount(raw);
  }
  const normalizedMarking: MarkingRateDraft = {};
  for (const [key, raw] of Object.entries(markingRates)) {
    normalizedMarking[key] = normalizeAmount(raw);
  }
  const normalizedTravel: TravelRateDraft = {};
  for (const [region, raw] of Object.entries(travelRates)) {
    normalizedTravel[region] = normalizeAmount(raw);
  }
  const normalizedZones = travelZones.map((zone) => ({
    id: zone.id,
    name: zone.name.trim(),
    regions: [...zone.regions].sort(),
  }));
  const normalizedFactors: TravelRoleFactorDraft = {};
  for (const [key, raw] of Object.entries(travelRoleFactors)) {
    normalizedFactors[key] = normalizeFactor(raw);
  }
  return JSON.stringify({
    role: normalizedRole,
    marking: normalizedMarking,
    travel: normalizedTravel,
    travelZones: normalizedZones,
    travelFactors: normalizedFactors,
  });
}

function normalizeFactor(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return t;
  return n.toFixed(3).replace(/\.?0+$/, "") || "0";
}

export function parseOptionalFactorField(raw: string): { value: string | null; error?: string } {
  const t = raw.trim();
  if (!t) return { value: null };
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return { value: null, error: "Enter a valid factor" };
  if (n <= 0) return { value: null, error: "Factor must be greater than 0" };
  return { value: String(n) };
}

export function parseOptionalGhsField(raw: string): { value: string | null; error?: string } {
  const t = raw.trim();
  if (!t) return { value: null };
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return { value: null, error: "Enter a valid amount" };
  if (n < 0) return { value: null, error: "Amount cannot be negative" };
  return { value: n.toFixed(2) };
}

export type ExaminerRatesCellErrors = Record<string, string>;

export function validateExaminerRatesDraft(
  roleRates: RoleRateDraft,
  markingRates: MarkingRateDraft,
  travelRates: TravelRateDraft,
  travelZones: TravelZoneDraft,
  travelRoleFactors: TravelRoleFactorDraft,
): {
  roleErrors: ExaminerRatesCellErrors;
  markingErrors: ExaminerRatesCellErrors;
  travelErrors: ExaminerRatesCellErrors;
  travelZoneErrors: ExaminerRatesCellErrors;
  travelFactorErrors: ExaminerRatesCellErrors;
  valid: boolean;
} {
  const roleErrors: ExaminerRatesCellErrors = {};
  const markingErrors: ExaminerRatesCellErrors = {};
  const travelErrors: ExaminerRatesCellErrors = {};
  const travelZoneErrors: ExaminerRatesCellErrors = {};
  const travelFactorErrors: ExaminerRatesCellErrors = {};
  for (const [key, raw] of Object.entries(roleRates)) {
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) roleErrors[key] = parsed.error;
  }
  for (const [key, raw] of Object.entries(markingRates)) {
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) markingErrors[key] = parsed.error;
  }
  for (const [region, raw] of Object.entries(travelRates)) {
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) travelErrors[region] = parsed.error;
  }
  const seenZoneNames = new Set<string>();
  for (const zone of travelZones) {
    const name = zone.name.trim();
    if (!name) {
      travelZoneErrors[`zone:${zone.id}`] = "Zone name is required";
      continue;
    }
    if (seenZoneNames.has(name.toLowerCase())) {
      travelZoneErrors[`zone:${zone.id}`] = "Zone names must be unique";
    }
    seenZoneNames.add(name.toLowerCase());
  }
  for (const [key, raw] of Object.entries(travelRoleFactors)) {
    const parsed = parseOptionalFactorField(raw);
    if (parsed.error) travelFactorErrors[key] = parsed.error;
  }
  return {
    roleErrors,
    markingErrors,
    travelErrors,
    travelZoneErrors,
    travelFactorErrors,
    valid:
      Object.keys(roleErrors).length === 0 &&
      Object.keys(markingErrors).length === 0 &&
      Object.keys(travelErrors).length === 0 &&
      Object.keys(travelZoneErrors).length === 0 &&
      Object.keys(travelFactorErrors).length === 0,
  };
}

export function buildRoleRatesSavePayload(roleRates: RoleRateDraft): {
  items: ExaminerRoleAllowanceRateCell[];
  roleErrors: ExaminerRatesCellErrors;
} {
  const roleErrors: ExaminerRatesCellErrors = {};
  const items: ExaminerRoleAllowanceRateCell[] = [];
  for (const [key, raw] of Object.entries(roleRates)) {
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) {
      roleErrors[key] = parsed.error;
      continue;
    }
    const { allowance_type, examiner_type } = parseRoleCellKey(key);
    items.push({
      examiner_type,
      allowance_type,
      amount_ghs: parsed.value,
    });
  }
  return { items, roleErrors };
}

export function buildMarkingRatesSavePayload(markingRates: MarkingRateDraft): {
  items: ExaminerMarkingRateRow[];
  markingErrors: ExaminerRatesCellErrors;
} {
  const markingErrors: ExaminerRatesCellErrors = {};
  const items: ExaminerMarkingRateRow[] = [];
  for (const [key, raw] of Object.entries(markingRates)) {
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) {
      markingErrors[key] = parsed.error;
      continue;
    }
    const { subject_id, paper_number } = parseMarkingCellKey(key);
    items.push({
      subject_id,
      paper_number,
      rate_per_script_ghs: parsed.value,
    });
  }
  return { items, markingErrors };
}

export function buildTravelRatesSavePayload(
  travelRates: TravelRateDraft,
  travelZones: TravelZoneDraft,
  travelRoleFactors: TravelRoleFactorDraft,
): {
  items: ExaminerTravelRateRow[];
  zones: ExaminerTravelZoneRow[];
  role_factors: ExaminerTravelRoleFactorRow[];
  travelErrors: ExaminerRatesCellErrors;
  travelZoneErrors: ExaminerRatesCellErrors;
  travelFactorErrors: ExaminerRatesCellErrors;
} {
  const travelErrors: ExaminerRatesCellErrors = {};
  const travelZoneErrors: ExaminerRatesCellErrors = {};
  const travelFactorErrors: ExaminerRatesCellErrors = {};
  const items: ExaminerTravelRateRow[] = [];
  for (const region of REGION_OPTIONS.map((r) => r.value)) {
    const raw = travelRates[region] ?? "";
    const parsed = parseOptionalGhsField(raw);
    if (parsed.error) {
      travelErrors[region] = parsed.error;
      continue;
    }
    items.push({ region, amount_ghs: parsed.value });
  }

  const seenZoneNames = new Set<string>();
  const zones: ExaminerTravelZoneRow[] = [];
  for (const zone of travelZones) {
    const name = zone.name.trim();
    if (!name) {
      travelZoneErrors[`zone:${zone.id}`] = "Zone name is required";
      continue;
    }
    if (seenZoneNames.has(name.toLowerCase())) {
      travelZoneErrors[`zone:${zone.id}`] = "Zone names must be unique";
      continue;
    }
    seenZoneNames.add(name.toLowerCase());
    zones.push({
      id: zone.id,
      name,
      regions: [...zone.regions],
    });
  }

  const role_factors: ExaminerTravelRoleFactorRow[] = [];
  for (const zone of travelZones) {
    for (const role of EXAMINER_ROLE_TYPES) {
      const key = travelRoleZoneFactorKey(role, zone.id);
      const raw = travelRoleFactors[key] ?? "";
      const parsed = parseOptionalFactorField(raw);
      if (parsed.error) {
        travelFactorErrors[key] = parsed.error;
        continue;
      }
      role_factors.push({
        examiner_type: role,
        zone_id: zone.id,
        factor: parsed.value,
      });
    }
  }

  return { items, zones, role_factors, travelErrors, travelZoneErrors, travelFactorErrors };
}

export function formatExamLabel(ex: { year: number; exam_series?: string | null; exam_type: string }): string {
  return [String(ex.year), ex.exam_series?.trim() || "", ex.exam_type.trim()].filter(Boolean).join(" ");
}

export type ExamRatesConfigStatus = "complete" | "partial" | "empty" | "unknown";

const ROLE_CELLS_TOTAL = EXAMINER_ALLOWANCE_TYPE_OPTIONS.length * EXAMINER_ROLE_TYPES.length;

export function examinerRatesConfigStatus(
  roleRates: RoleRateDraft,
  markingRates: MarkingRateDraft,
  travelRates: TravelRateDraft,
  markingCellCount: number,
): {
  status: ExamRatesConfigStatus;
  configuredRoleCells: number;
  totalRoleCells: number;
  markingConfigured: number;
  markingTotal: number;
  travelConfigured: number;
} {
  const configuredRoleCells = Object.values(roleRates).filter((v) => v.trim()).length;
  const markingConfigured = Object.values(markingRates).filter((v) => v.trim()).length;
  const travelConfigured = REGION_OPTIONS.filter((r) => (travelRates[r.value] ?? "").trim()).length;

  if (markingCellCount === 0) {
    return {
      status: "unknown",
      configuredRoleCells,
      totalRoleCells: ROLE_CELLS_TOTAL,
      markingConfigured,
      markingTotal: 0,
      travelConfigured,
    };
  }
  if (configuredRoleCells === 0 && markingConfigured === 0 && travelConfigured === 0) {
    return {
      status: "empty",
      configuredRoleCells,
      totalRoleCells: ROLE_CELLS_TOTAL,
      markingConfigured,
      markingTotal: markingCellCount,
      travelConfigured,
    };
  }
  if (
    configuredRoleCells === ROLE_CELLS_TOTAL &&
    markingConfigured === markingCellCount &&
    travelConfigured === REGION_OPTIONS.length
  ) {
    return {
      status: "complete",
      configuredRoleCells,
      totalRoleCells: ROLE_CELLS_TOTAL,
      markingConfigured,
      markingTotal: markingCellCount,
      travelConfigured,
    };
  }
  return {
    status: "partial",
    configuredRoleCells,
    totalRoleCells: ROLE_CELLS_TOTAL,
    markingConfigured,
    markingTotal: markingCellCount,
    travelConfigured,
  };
}
