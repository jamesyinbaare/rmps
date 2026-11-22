"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FeeCandidateItem } from "@/types";
import { TYPE_FILTERS, formatGhs, statusLabel } from "./fees-utils";

function openInvoiceTooltip(c: FeeCandidateItem): string {
  const number = c.open_invoice_number || "invoice";
  const parts = [`Invoice ${number}`];
  if (c.open_invoice_status) {
    parts.push(statusLabel(c.open_invoice_status));
  }
  if (c.open_invoice_amount != null) {
    parts.push(formatGhs(c.open_invoice_amount));
  }
  return parts.join(" · ");
}

interface FeesCandidatePanelProps {
  candidates: FeeCandidateItem[];
  selectedIds: Set<number>;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  onToggleAll: (checked: boolean, visibleSelectableIds: number[]) => void;
  onToggleOne: (id: number, checked: boolean) => void;
  gated: boolean;
  gateMessage: string;
}

function candidateSearchText(c: FeeCandidateItem): string {
  return [
    c.registration_number,
    c.firstname,
    c.othername,
    c.lastname,
    c.programme_code,
    (c.registration_type || "").replace(/_/g, " "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function FeesCandidatePanel({
  candidates,
  selectedIds,
  typeFilter,
  onTypeFilterChange,
  onToggleAll,
  onToggleOne,
  gated,
  gateMessage,
}: FeesCandidatePanelProps) {
  const [search, setSearch] = useState("");

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter((c) => candidateSearchText(c).includes(query));
  }, [candidates, search]);

  const visibleSelectableIds = useMemo(
    () => filteredCandidates.filter((c) => !c.on_open_invoice).map((c) => c.id),
    [filteredCandidates]
  );

  const allSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selectedIds.has(id));

  const selectedVisibleCount = filteredCandidates.filter((c) =>
    selectedIds.has(c.id)
  ).length;

  return (
    <div className="flex max-h-[min(50vh,28rem)] min-h-[20rem] flex-col overflow-hidden rounded-lg border border-border bg-card lg:max-h-[min(60vh,32rem)]">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Candidates</p>
            <p className="text-xs text-muted-foreground">
              Select who to include on the next invoice
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setSearch("");
                  onTypeFilterChange(f.value);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  typeFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {!gated ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by reg. no., name, programme…"
              className="h-9 pl-9 shadow-none"
            />
          </div>
        ) : null}
      </div>

      {gated ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {gateMessage}
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No matching unpaid candidates for this filter.
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No candidates match your search.
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) =>
                        onToggleAll(Boolean(v), visibleSelectableIds)
                      }
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="p-3 font-medium">Reg. no.</th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="hidden p-3 font-medium sm:table-cell">Type</th>
                  <th className="p-3 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-border/60 transition-colors duration-150 hover:bg-muted/30",
                      selectedIds.has(c.id) && "bg-muted/40",
                      c.on_open_invoice && "opacity-60"
                    )}
                  >
                    <td className="p-3">
                      <Checkbox
                        disabled={c.on_open_invoice}
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={(v) => onToggleOne(c.id, Boolean(v))}
                        aria-label={`Select ${c.registration_number}`}
                      />
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {c.registration_number}
                    </td>
                    <td className="p-3">
                      <span className="font-medium">
                        {c.firstname} {c.othername || ""} {c.lastname}
                      </span>
                      {c.on_open_invoice ? (
                        <span
                          className="ml-2 cursor-help text-xs text-amber-600 dark:text-amber-400"
                          title={openInvoiceTooltip(c)}
                        >
                          pending
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden p-3 text-muted-foreground sm:table-cell">
                      {(c.registration_type || "").replace(/_/g, " ")}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      {formatGhs(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="shrink-0 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {selectedVisibleCount} selected · {filteredCandidates.length} shown
            {search.trim() ? ` (of ${candidates.length})` : ""}
          </div>
        </>
      )}
    </div>
  );
}
