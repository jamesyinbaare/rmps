"use client";

import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Landmark, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { DataTable } from "@/components/data-table";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayBankCode, type BankBranchRow } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export const BANK_DIRECTORY_DEFAULT_PAGE_SIZE = 50;
export const BANK_DIRECTORY_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;

type Props = {
  items: BankBranchRow[];
  busy: boolean;
  selectedBankName: string;
  onSelectedBankNameChange: (bankName: string) => void;
  bankOptions: { value: string; label: string }[];
  onBankSearchChange: (query: string) => void;
  branchQuery: string;
  onBranchQueryChange: (query: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function BankDirectoryTable({
  items,
  busy,
  selectedBankName,
  onSelectedBankNameChange,
  bankOptions,
  onBankSearchChange,
  branchQuery,
  onBranchQueryChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const hasBank = selectedBankName.trim().length > 0;
  const branchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasBank) return;
    const t = window.setTimeout(() => branchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [hasBank, selectedBankName]);

  const filteredItems = useMemo(() => {
    const q = branchQuery.trim().toLowerCase();
    const sorted = [...items].sort((a, b) =>
      a.branch_name.localeCompare(b.branch_name, undefined, { sensitivity: "base" }),
    );
    if (!q) return sorted;
    return sorted.filter((row) => {
      const code = displayBankCode(row.bank_code).toLowerCase();
      return row.branch_name.toLowerCase().includes(q) || code.includes(q);
    });
  }, [branchQuery, items]);

  const total = filteredItems.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, pageSize, safePage]);

  useEffect(() => {
    if (page !== safePage) onPageChange(safePage);
  }, [onPageChange, page, safePage]);

  const columns = useMemo<ColumnDef<BankBranchRow>[]>(
    () => [
      {
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {(safePage - 1) * pageSize + row.index + 1}
          </span>
        ),
        meta: { cellClassName: "w-12 px-3 py-2.5 sm:px-4" },
      },
      {
        accessorKey: "branch_name",
        header: "Branch",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.branch_name}</span>
        ),
        meta: { cellClassName: "px-4 py-2.5" },
      },
      {
        accessorKey: "bank_code",
        header: "Sort code",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="rounded-md bg-muted/80 px-2 py-1 font-mono text-xs tracking-wider text-foreground">
            {displayBankCode(row.original.bank_code)}
          </span>
        ),
        meta: { cellClassName: "px-4 py-2.5" },
      },
    ],
    [pageSize, safePage],
  );

  const table = useReactTable({
    data: pageItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  function clearBank() {
    onSelectedBankNameChange("");
    onBranchQueryChange("");
    onBankSearchChange("");
    onPageChange(1);
  }

  const showLoading = hasBank && busy && items.length === 0;
  const showRefreshing = hasBank && busy && items.length > 0;
  const hasBranchFilter = branchQuery.trim().length > 0;

  return (
    <section className={cn(officialAccountsPanelClass, "flex min-h-0 flex-col gap-0 overflow-hidden p-0")}>
      <div className={cn(officialAccountsCommandBarClass, "gap-4")}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Start with the bank</p>
          <p className="text-xs text-muted-foreground">
            Pick a bank first, then type a branch name or sort code to narrow the list.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="bank-directory-bank"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                1
              </span>
              Bank
            </label>
            <SearchableCombobox
              id="bank-directory-bank"
              options={bankOptions}
              value={selectedBankName}
              onChange={(value) => {
                onSelectedBankNameChange(value);
                onBranchQueryChange("");
                onPageChange(1);
              }}
              onSearchChange={onBankSearchChange}
              placeholder="Search for a bank…"
              searchPlaceholder="Type the bank name…"
              emptyText="No banks match that name."
              showAllOption={false}
              widthClass="w-full"
              truncateTrigger
              triggerClassName="h-11 min-h-11"
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="bank-directory-branch"
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                hasBank ? "text-muted-foreground" : "text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                  hasBank
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                2
              </span>
              Find branch
            </label>
            <div className="relative">
              <Search
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
                  hasBank ? "text-muted-foreground" : "text-muted-foreground/50",
                )}
                aria-hidden
              />
              <input
                ref={branchInputRef}
                id="bank-directory-branch"
                type="search"
                value={branchQuery}
                onChange={(e) => {
                  onBranchQueryChange(e.target.value);
                  onPageChange(1);
                }}
                disabled={!hasBank}
                placeholder={
                  hasBank ? "Type a branch name or sort code…" : "Pick a bank first"
                }
                className={cn(
                  "block h-11 w-full rounded-lg border border-input-border bg-input py-2 pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground",
                )}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        {hasBank ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <Badge variant="outline" className="max-w-full gap-1.5 truncate font-normal">
              <Landmark className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{selectedBankName}</span>
            </Badge>
            {!showLoading ? (
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <MapPin className="size-3.5 opacity-70" aria-hidden />
                {total.toLocaleString()} {total === 1 ? "branch" : "branches"}
                {hasBranchFilter ? " matched" : ""}
              </Badge>
            ) : null}
            {showRefreshing ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={clearBank}
            >
              <X className="size-3.5" aria-hidden />
              Change bank
            </Button>
          </div>
        ) : null}
      </div>

      <div className="relative min-w-0 overflow-x-auto border-t border-border/70">
        {!hasBank ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Landmark className="size-6" aria-hidden />
            </span>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium text-foreground">Waiting on a bank</p>
              <p className="text-sm text-muted-foreground">
                Once you choose a bank, we’ll list every branch and sort code under it.
              </p>
            </div>
          </div>
        ) : showLoading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Loading branches for {selectedBankName}…
          </div>
        ) : (
          <div className={cn(showRefreshing && "opacity-60 transition-opacity")}>
            <DataTable
              table={table}
              className="rounded-none border-0"
              headerRowClassName="bg-muted/40"
              headerCellClassName="px-4 py-2.5 text-sm font-semibold text-foreground"
              emptyMessage={
                hasBranchFilter
                  ? `Nothing matched “${branchQuery.trim()}” under ${selectedBankName}. Try another name or sort code.`
                  : `We couldn’t find any branches for ${selectedBankName}.`
              }
              striped
            />
          </div>
        )}
      </div>

      {hasBank && !showLoading ? (
        <OfficialAccountsPagination
          page={safePage}
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
      ) : null}
    </section>
  );
}
