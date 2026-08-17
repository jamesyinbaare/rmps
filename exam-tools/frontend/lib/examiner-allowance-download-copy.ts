import type { ExaminerPayoutView } from "@/lib/examiner-payout-view";

export type ExaminerAllowanceDownloadKind =
  | "excel"
  | "bog_all"
  | "bog_travel_commuting"
  | "bog_allowances_marking";

export type ExaminerAllowanceDownloadCopy = {
  title: string;
  summary: string;
  includes: string[];
  excludes?: string[];
  formatNote: string;
};

const BOG_FORMAT =
  "Bank of Ghana payment workbook: one row per examiner with serial, bank sort code, account number, name, role, phone, and a single payout amount.";

const BOG_FORMAT_WITH_SCRIPTS =
  "Bank of Ghana payment workbook: one row per examiner with serial, bank sort code, account number, name, role, phone, allocated scripts (total and per paper), and a single payout amount.";

export const EXAMINER_ALLOWANCE_DOWNLOAD_COPY: Record<
  ExaminerAllowanceDownloadKind,
  ExaminerAllowanceDownloadCopy
> = {
  excel: {
    title: "Export Excel",
    summary:
      "A detailed spreadsheet for checking and auditing examiner pay on this subject. Each examiner is one row with the full breakdown.",
    includes: [
      "Identity, phone, reference code, subjects",
      "Bank details and bank status",
      "Role allowances (responsibility, inconvenience, CER, vetting)",
      "Internal commuting, marking pay, allocated scripts (total and per paper)",
      "T&T, split payout totals, and overall total",
    ],
    formatNote: "Optional columns (subject names, travel zone) can be added before you download.",
  },
  bog_all: {
    title: "BoG — All together",
    summary:
      "A Bank of Ghana payment file where each examiner’s amount is their full total payable for this filter.",
    includes: [
      "T&T (travel & transport)",
      "Internal commuting",
      "Role allowances (responsibility, inconvenience, and related lines)",
      "Marking pay (net of tax where applicable)",
      "Allocated scripts (total and per paper)",
    ],
    formatNote: BOG_FORMAT_WITH_SCRIPTS,
  },
  bog_travel_commuting: {
    title: "BoG — T&T & commuting",
    summary:
      "A Bank of Ghana payment file limited to travel money only — useful when T&T and commuting are paid separately from marking.",
    includes: ["T&T (travel & transport)", "Internal commuting"],
    excludes: ["Role allowances", "Marking pay", "Vetting and other non-travel lines"],
    formatNote: BOG_FORMAT,
  },
  bog_allowances_marking: {
    title: "BoG — Allowances & marking",
    summary:
      "A Bank of Ghana payment file for allowances and marking only — without travel or commuting.",
    includes: [
      "Role allowances (responsibility, inconvenience, chief examiner’s report, vetting)",
      "Marking pay (net of tax where applicable)",
      "Allocated scripts (total and per paper)",
    ],
    excludes: ["T&T (travel & transport)", "Internal commuting"],
    formatNote: BOG_FORMAT_WITH_SCRIPTS,
  },
};

export function bogDownloadKindFromPayoutMode(mode: ExaminerPayoutView): ExaminerAllowanceDownloadKind {
  if (mode === "travel_commuting") return "bog_travel_commuting";
  if (mode === "allowances_marking") return "bog_allowances_marking";
  return "bog_all";
}

export function payoutModeFromBogDownloadKind(
  kind: ExaminerAllowanceDownloadKind,
): ExaminerPayoutView | null {
  if (kind === "bog_all") return "all";
  if (kind === "bog_travel_commuting") return "travel_commuting";
  if (kind === "bog_allowances_marking") return "allowances_marking";
  return null;
}

export function parseExaminerAllowanceDownloadKind(
  key: string,
): ExaminerAllowanceDownloadKind | null {
  if (
    key === "excel" ||
    key === "bog_all" ||
    key === "bog_travel_commuting" ||
    key === "bog_allowances_marking"
  ) {
    return key;
  }
  return null;
}
