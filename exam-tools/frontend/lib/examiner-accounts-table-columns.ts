import type { VisibilityState } from "@tanstack/react-table";

export const EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS = [
  { id: "role", label: "Role", defaultVisible: true },
  { id: "region", label: "Region", defaultVisible: false },
  { id: "subjects", label: "Subjects", defaultVisible: true },
  { id: "bank", label: "Bank", defaultVisible: false },
  { id: "branch", label: "Branch", defaultVisible: false },
  { id: "account", label: "Account", defaultVisible: false },
  { id: "source", label: "Source", defaultVisible: false },
] as const;

export type ExaminerAccountsColumnId = (typeof EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS)[number]["id"];

export type ExaminerAccountsTableLayout = "composite" | "classic";

export const EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS.map((c) => [c.id, c.defaultVisible]),
);

export function isExaminerAccountsColumnVisible(
  columnVisibility: VisibilityState,
  columnId: ExaminerAccountsColumnId,
): boolean {
  return columnVisibility[columnId] !== false;
}

export function usesSplitBankColumns(columnVisibility: VisibilityState): boolean {
  return (
    isExaminerAccountsColumnVisible(columnVisibility, "bank") ||
    isExaminerAccountsColumnVisible(columnVisibility, "branch") ||
    isExaminerAccountsColumnVisible(columnVisibility, "account")
  );
}

export function examinerAccountsTableColSpan(
  columnVisibility: VisibilityState,
  showSubjectScripts: boolean,
  layout: ExaminerAccountsTableLayout = "composite",
): number {
  if (layout === "classic") {
    let count = 4;
    if (isExaminerAccountsColumnVisible(columnVisibility, "role")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "region")) count++;
    if (!showSubjectScripts && isExaminerAccountsColumnVisible(columnVisibility, "subjects")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "bank")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "branch")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "account")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "source")) count++;
    return count;
  }

  let count = 3;
  if (usesSplitBankColumns(columnVisibility)) {
    count -= 1;
    if (isExaminerAccountsColumnVisible(columnVisibility, "bank")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "branch")) count++;
    if (isExaminerAccountsColumnVisible(columnVisibility, "account")) count++;
  }
  if (!showSubjectScripts && isExaminerAccountsColumnVisible(columnVisibility, "subjects")) count++;
  if (isExaminerAccountsColumnVisible(columnVisibility, "source")) count++;
  return count;
}
