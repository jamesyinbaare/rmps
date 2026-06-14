"use client";

import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Building2, Loader2, Search } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { Badge } from "@/components/ui/badge";
import { displayBankCode, type BankBranchRow } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export const BANK_DIRECTORY_DEFAULT_PAGE_SIZE = 50;
export const BANK_DIRECTORY_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;

type Props = {
  items: BankBranchRow[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function BankDirectoryTable({
  items,
  total,
  page,
  pageSize,
  busy,
  searchQuery,
  onSearchQueryChange,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const hasSearch = searchQuery.trim().length > 0;

  const columns = useMemo<ColumnDef<BankBranchRow>[]>(
    () => [
      {
        accessorKey: "bank_code",
        header: "Bank code",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{displayBankCode(row.original.bank_code)}</span>
        ),
        meta: { cellClassName: "px-4 py-2.5" },
      },
      {
        accessorKey: "bank_name",
        header: "Bank name",
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.bank_name}</span>,
        meta: { cellClassName: "px-4 py-2.5" },
      },
      {
        accessorKey: "branch_name",
        header: "Branch name",
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.branch_name}</span>,
        meta: { cellClassName: "px-4 py-2.5" },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const showInitialLoading = busy && items.length === 0;
  const showRefreshing = busy && items.length > 0;

  return (
    <section className={cn(officialAccountsPanelClass, "flex min-h-0 flex-col gap-0 overflow-hidden p-0")}>
      <div className={officialAccountsCommandBarClass}>
        <div className={officialAccountsCommandBarRowClass}>
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor="bank-directory-search" className="sr-only">
              Search bank or branch name
            </label>
            <input
              id="bank-directory-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search by bank or branch name…"
              className={cn(officialAccountsCommandBarSearchClass, "pl-9 lg:max-w-none")}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {!showInitialLoading ? (
            <div className="flex shrink-0 items-center gap-2">
              {showRefreshing ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <Building2 className="size-3.5 opacity-70" aria-hidden />
                {total.toLocaleString()} {total === 1 ? "branch" : "branches"}
                {hasSearch ? " found" : ""}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative min-w-0 overflow-x-auto border-t border-border/70">
        {showInitialLoading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Loading bank directory…
          </div>
        ) : (
          <div className={cn(showRefreshing && "opacity-60 transition-opacity")}>
            <DataTable
              table={table}
              className="rounded-none border-0"
              headerRowClassName="bg-muted/40"
              headerCellClassName="px-4 py-2.5 text-sm font-semibold text-foreground"
              emptyMessage={
                hasSearch
                  ? "No branches match your search. Try a different bank or branch name."
                  : "No branches yet. Upload a spreadsheet above to populate the directory."
              }
              striped
            />
          </div>
        )}
      </div>

      <OfficialAccountsPagination
        page={page}
        pageSize={pageSize}
        total={total}
        busy={busy}
        recordLabel="branch"
        pageSizeOptions={[...BANK_DIRECTORY_PAGE_SIZE_OPTIONS]}
        onPageChange={onPageChange}
        onPageSizeChange={(size) => {
          onPageSizeChange(size);
          onPageChange(1);
        }}
      />
    </section>
  );
}
