"use client";

import { useMemo, useState } from "react";
import { PackageOpen, Search } from "lucide-react";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  envelopeEligibleExaminerOptions,
  isEnvelopeEligibleForExaminer,
} from "@/components/scripts-allocation/examiner-assignment-modal";
import {
  type AllocationExaminerRow,
  type UnassignedEnvelopeItem,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  envelopes: UnassignedEnvelopeItem[];
  poolRows: AllocationExaminerRow[];
  allowCrossMarkingOverride?: boolean;
  onAssign: (envelope: UnassignedEnvelopeItem, examinerId: string) => void | Promise<void>;
};

export function UnassignedEnvelopesModal({
  open,
  onClose,
  busy,
  envelopes,
  poolRows,
  allowCrossMarkingOverride = false,
  onAssign,
}: Props) {
  const [filterRegion, setFilterRegion] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [search, setSearch] = useState("");
  const [rowExaminerIds, setRowExaminerIds] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [assigningEnvelopeId, setAssigningEnvelopeId] = useState<string | null>(null);

  const regionFilterOptions = useMemo(() => {
    const set = new Set(
      envelopes.map((r) => (r.region ?? "").trim()).filter((s) => s.length > 0),
    );
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [envelopes]);

  const zoneFilterOptions = useMemo(() => {
    let rows = envelopes;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    const set = new Set(rows.map((r) => r.zone).filter((z) => z && String(z).trim().length > 0));
    return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
  }, [envelopes, filterRegion]);

  const seriesFilterOptions = useMemo(() => {
    let rows = envelopes;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    if (filterZone) rows = rows.filter((r) => r.zone === filterZone);
    const set = new Set(rows.map((r) => r.series_number));
    return [...set].sort((a, b) => a - b);
  }, [envelopes, filterRegion, filterZone]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return envelopes.filter((row) => {
      if (filterRegion && (row.region ?? "") !== filterRegion) return false;
      if (filterZone && row.zone !== filterZone) return false;
      if (filterSeries && String(row.series_number) !== filterSeries) return false;
      if (!q) return true;
      const haystack = [
        row.school_code,
        row.school_name,
        row.region ?? "",
        row.zone,
        String(row.series_number),
        String(row.envelope_number),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [envelopes, filterRegion, filterZone, filterSeries, search]);

  const assignableCount = useMemo(
    () =>
      filtered.filter((row) => envelopeEligibleExaminerOptions(row, poolRows, allowCrossMarkingOverride).length > 0)
        .length,
    [filtered, poolRows, allowCrossMarkingOverride],
  );

  const filtersActive = Boolean(filterRegion || filterZone || filterSeries || search.trim());

  function handleClose() {
    setFilterRegion("");
    setFilterZone("");
    setFilterSeries("");
    setSearch("");
    setRowExaminerIds({});
    setRowError(null);
    setAssigningEnvelopeId(null);
    onClose();
  }

  async function handleAssignRow(envelope: UnassignedEnvelopeItem) {
    const examinerId = rowExaminerIds[envelope.script_envelope_id];
    if (!examinerId) return;
    setRowError(null);
    setAssigningEnvelopeId(envelope.script_envelope_id);
    try {
      await onAssign(envelope, examinerId);
      setRowExaminerIds((prev) => {
        const next = { ...prev };
        delete next[envelope.script_envelope_id];
        return next;
      });
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssigningEnvelopeId(null);
    }
  }

  return (
    <CohortModalShell
      open={open}
      onClose={handleClose}
      closeDisabled={busy}
      title="Unassigned envelopes"
      description={
        allowCrossMarkingOverride
          ? "Pick an examiner for each envelope. Eligible examiners are listed first; you may also assign outside cross-marking rules (marked as manual override)."
          : "Pick an examiner for each envelope. Only eligible examiners appear in the list."
      }
      className="max-w-6xl"
      bodyClassName="!px-0 !py-0"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {assignableCount} of {filtered.length} visible envelope{filtered.length === 1 ? "" : "s"} can be assigned
            {filtersActive ? " (filtered)" : ""}.
          </p>
          <Button type="button" variant="outline" disabled={busy} onClick={handleClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <PackageOpen className="size-3.5" aria-hidden />
              {envelopes.length} unassigned
            </Badge>
            {filtersActive ? (
              <Badge variant="muted">{filtered.length} shown</Badge>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="unassigned-search" className={formLabelClass}>
                Search
              </label>
              <div className="relative mt-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="unassigned-search"
                  type="search"
                  autoComplete="off"
                  className={cn(formInputClass, "mt-0 pl-9")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="School, zone, series…"
                />
              </div>
            </div>
            <div>
              <label htmlFor="unassigned-filter-region" className={formLabelClass}>
                Region
              </label>
              <select
                id="unassigned-filter-region"
                className={`${formInputClass} mt-1 w-full`}
                value={filterRegion}
                onChange={(e) => {
                  setFilterRegion(e.target.value);
                  setFilterZone("");
                  setFilterSeries("");
                }}
              >
                <option value="">All regions</option>
                {regionFilterOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="unassigned-filter-zone" className={formLabelClass}>
                Zone
              </label>
              <select
                id="unassigned-filter-zone"
                className={`${formInputClass} mt-1 w-full`}
                value={filterZone}
                onChange={(e) => {
                  setFilterZone(e.target.value);
                  setFilterSeries("");
                }}
              >
                <option value="">All zones</option>
                {zoneFilterOptions.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="unassigned-filter-series" className={formLabelClass}>
                Series
              </label>
              <select
                id="unassigned-filter-series"
                className={`${formInputClass} mt-1 w-full`}
                value={filterSeries}
                onChange={(e) => setFilterSeries(e.target.value)}
              >
                <option value="">All series</option>
                {seriesFilterOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filtersActive ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setFilterRegion("");
                  setFilterZone("");
                  setFilterSeries("");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-6">
          {rowError ? (
            <p className="mb-3 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rowError}
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              {envelopes.length === 0
                ? "All envelopes are assigned for this run."
                : "No envelopes match the current filters."}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-sm">
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm leading-normal">
                  <thead>
                    <tr className="sticky top-0 z-1 border-b border-border bg-muted/90 backdrop-blur-sm">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        School
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Location
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Series / Env
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Booklets
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Assign to
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:nth-child(even)]:bg-muted/15">
                    {filtered.map((row) => {
                      const examinerOptions = envelopeEligibleExaminerOptions(
                        row,
                        poolRows,
                        allowCrossMarkingOverride,
                      );
                      const rowExaminerId = rowExaminerIds[row.script_envelope_id] ?? "";
                      const rowBusy = busy || assigningEnvelopeId === row.script_envelope_id;
                      const noEligible = examinerOptions.length === 0;
                      const selectedOutsideRules =
                        Boolean(rowExaminerId) &&
                        !isEnvelopeEligibleForExaminer(row, rowExaminerId);
                      return (
                        <tr
                          key={row.script_envelope_id}
                          className={cn(
                            "border-b border-border/70 align-middle transition-colors",
                            noEligible && "opacity-45",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground">{row.school_name}</p>
                            <p className="text-xs text-muted-foreground">{row.school_code}</p>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            <p>{(row.region ?? "").trim() || "—"}</p>
                            <p className="text-xs">Zone {row.zone}</p>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                            S{row.series_number} · E{row.envelope_number}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                            {row.booklet_count}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="min-w-[200px] max-w-[280px]">
                                <SearchableCombobox
                                  options={examinerOptions}
                                  value={rowExaminerId}
                                  onChange={(value) =>
                                    setRowExaminerIds((prev) => ({
                                      ...prev,
                                      [row.script_envelope_id]: value,
                                    }))
                                  }
                                  placeholder={noEligible ? "No examiners" : "Choose examiner…"}
                                  searchPlaceholder="Search examiners…"
                                  showAllOption={false}
                                  widthClass="w-full min-w-[200px] max-w-[280px]"
                                  disabled={rowBusy || noEligible}
                                />
                                {selectedOutsideRules ? (
                                  <p className="mt-1 text-right text-[10px] text-amber-800 dark:text-amber-200">
                                    Manual override
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-9 shrink-0 px-3 text-xs"
                                disabled={rowBusy || !rowExaminerId || noEligible}
                                onClick={() => void handleAssignRow(row)}
                              >
                                {assigningEnvelopeId === row.script_envelope_id ? "Assigning…" : "Assign"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </CohortModalShell>
  );
}
