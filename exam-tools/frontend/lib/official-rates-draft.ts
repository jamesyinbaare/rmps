import type { ExaminationDesignationRateRow } from "@/lib/api";

export type OfficialRatesDraftRow = {
  designation: string;
  daily_rate_ghs: string;
  commuting_allowance_ghs: string;
  airtime_ghs: string;
};

export type OfficialRatesAmountField = keyof Omit<OfficialRatesDraftRow, "designation">;

export type OfficialRatesFieldErrors = Partial<Record<OfficialRatesAmountField, string>>;

export type OfficialRatesRowErrors = Record<string, OfficialRatesFieldErrors>;

export function rowToDraft(row: ExaminationDesignationRateRow): OfficialRatesDraftRow {
  return {
    designation: row.designation,
    daily_rate_ghs: row.daily_rate_ghs ?? "",
    commuting_allowance_ghs: row.commuting_allowance_ghs ?? "",
    airtime_ghs: row.airtime_ghs ?? "",
  };
}

function normalizeAmount(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return t;
  return n.toFixed(2);
}

export function serializeOfficialRatesRows(rows: OfficialRatesDraftRow[]): string {
  const normalized = rows.map((r) => ({
    designation: r.designation,
    daily_rate_ghs: normalizeAmount(r.daily_rate_ghs),
    commuting_allowance_ghs: normalizeAmount(r.commuting_allowance_ghs),
    airtime_ghs: normalizeAmount(r.airtime_ghs),
  }));
  return JSON.stringify(normalized);
}

export function isDailyRateConfigured(row: OfficialRatesDraftRow): boolean {
  return row.daily_rate_ghs.trim().length > 0;
}

export function countConfiguredDesignations(rows: OfficialRatesDraftRow[]): number {
  return rows.filter(isDailyRateConfigured).length;
}

export function parseOptionalGhsField(
  raw: string,
  label: string,
): { value: string | null; error?: string } {
  const t = raw.trim();
  if (!t) return { value: null };
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) {
    return { value: null, error: "Enter a valid amount" };
  }
  if (n < 0) {
    return { value: null, error: "Amount cannot be negative" };
  }
  return { value: n.toFixed(2) };
}

export function validateOfficialRatesRows(rows: OfficialRatesDraftRow[]): {
  rowErrors: OfficialRatesRowErrors;
  valid: boolean;
} {
  const rowErrors: OfficialRatesRowErrors = {};
  for (const row of rows) {
    const fields: OfficialRatesFieldErrors = {};
    const daily = parseOptionalGhsField(row.daily_rate_ghs, "Daily rate");
    if (daily.error) fields.daily_rate_ghs = daily.error;
    const commuting = parseOptionalGhsField(row.commuting_allowance_ghs, "Commuting per day");
    if (commuting.error) fields.commuting_allowance_ghs = commuting.error;
    const airtime = parseOptionalGhsField(row.airtime_ghs, "Airtime");
    if (airtime.error) fields.airtime_ghs = airtime.error;
    if (Object.keys(fields).length > 0) {
      rowErrors[row.designation] = fields;
    }
  }
  return { rowErrors, valid: Object.keys(rowErrors).length === 0 };
}

export function buildSavePayload(rows: OfficialRatesDraftRow[]): {
  items: {
    designation: string;
    daily_rate_ghs: string | null;
    commuting_allowance_ghs: string | null;
    airtime_ghs: string | null;
  }[];
  rowErrors: OfficialRatesRowErrors;
} {
  const rowErrors: OfficialRatesRowErrors = {};
  const items = rows.map((row) => {
    const fields: OfficialRatesFieldErrors = {};
    const daily = parseOptionalGhsField(row.daily_rate_ghs, "Daily rate");
    if (daily.error) fields.daily_rate_ghs = daily.error;
    const commuting = parseOptionalGhsField(row.commuting_allowance_ghs, "Commuting per day");
    if (commuting.error) fields.commuting_allowance_ghs = commuting.error;
    const airtime = parseOptionalGhsField(row.airtime_ghs, "Airtime");
    if (airtime.error) fields.airtime_ghs = airtime.error;
    if (Object.keys(fields).length > 0) {
      rowErrors[row.designation] = fields;
    }
    return {
      designation: row.designation,
      daily_rate_ghs: daily.value,
      commuting_allowance_ghs: commuting.value,
      airtime_ghs: airtime.value,
    };
  });
  return { items, rowErrors };
}

export function formatExamLabel(ex: { year: number; exam_series?: string | null; exam_type: string }): string {
  return [String(ex.year), ex.exam_series?.trim() || "", ex.exam_type.trim()].filter(Boolean).join(" ");
}

export type ExamRatesConfigStatus = "complete" | "partial" | "empty" | "unknown";

export function ratesConfigStatusFromRows(rows: OfficialRatesDraftRow[]): ExamRatesConfigStatus {
  if (rows.length === 0) return "unknown";
  const configured = countConfiguredDesignations(rows);
  if (configured === 0) return "empty";
  if (configured === rows.length) return "complete";
  return "partial";
}
