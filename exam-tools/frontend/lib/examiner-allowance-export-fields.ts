export const EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS = [
  {
    key: "subject_names",
    label: "Subject names",
    hint: "Full subject titles in addition to codes",
  },
  {
    key: "travel_zone",
    label: "Travel zone",
    hint: "Zone used for T&T calculation",
  },
] as const;

export type ExaminerAllowanceOptionalExportField =
  (typeof EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS)[number]["key"];
