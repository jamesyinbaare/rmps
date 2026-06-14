import type { VisibilityState } from "@tanstack/react-table";

export const EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS = [
  { id: "role", label: "Role", defaultVisible: false },
  { id: "region", label: "Region", defaultVisible: true },
  { id: "subjects", label: "Subjects", defaultVisible: true },
  { id: "bank", label: "Bank", defaultVisible: true },
  { id: "branch", label: "Branch", defaultVisible: true },
  { id: "account", label: "Account", defaultVisible: true },
  { id: "source", label: "Source", defaultVisible: false },
] as const;

export type ExaminerAccountsColumnId = (typeof EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS)[number]["id"];

export const EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS.map((c) => [c.id, c.defaultVisible]),
);

export function isExaminerAccountsColumnVisible(
  columnVisibility: VisibilityState,
  columnId: ExaminerAccountsColumnId,
): boolean {
  return columnVisibility[columnId] !== false;
}

export function examinerAccountsTableColSpan(
  columnVisibility: VisibilityState,
  showSubjectScripts: boolean,
): number {
  let count = 4; // #, name, scripts, payout
  if (isExaminerAccountsColumnVisible(columnVisibility, "role")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "region")) count++;
  if (!showSubjectScripts && isExaminerAccountsColumnVisible(columnVisibility, "subjects")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "bank")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "branch")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "account")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "source")) count++;
  return count;
}
