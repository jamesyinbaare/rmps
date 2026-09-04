"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { listAdminExaminerAllowances, type ExaminerTypeApi } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const PICKER_LIMIT = 500;

function sourceLabel(source: string): string {
  if (source === "special" || source === "payout_override") return "Special";
  if (source === "invitation") return "Invitation";
  return "Regular";
}

function roleAbbrev(type: string): string {
  return EXAMINER_TYPE_ABBREVIATIONS[type as ExaminerTypeApi] ?? type;
}

type Props = {
  examinationId: number;
  groupName: string;
  existingMemberIds: Set<string>;
  busy: boolean;
  onClose: () => void;
  onAdd: (examinerIds: string[]) => void;
};

export function ExaminerAllowanceGroupMembersModal({
  examinationId,
  groupName,
  existingMemberIds,
  busy,
  onClose,
  onAdd,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState<"all" | "regular" | "special">("all");
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [candidates, setCandidates] = useState<
    {
      id: string;
      name: string;
      examiner_type: string;
      region: string;
      roster_source: string;
      reference_code?: string | null;
    }[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await listAdminExaminerAllowances({
          examination_id: examinationId,
          search: debouncedSearch || null,
          source: source === "all" ? null : source,
          role: role || null,
          region: region || null,
          skip: 0,
          limit: PICKER_LIMIT,
        });
        if (cancelled) return;
        setCandidates(
          data.items.map((row) => ({
            id: row.id,
            name: row.full_name,
            examiner_type: row.examiner_type,
            region: row.region,
            roster_source: row.roster_source,
            reference_code: row.reference_code,
          })),
        );
        setTotal(data.total);
        setSelected(new Set());
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load examiners.");
          setCandidates([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examinationId, debouncedSearch, source, role, region]);

  const selectable = useMemo(
    () => candidates.filter((c) => !existingMemberIds.has(c.id)),
    [candidates, existingMemberIds],
  );

  const selectedCount = selected.size;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Add examiners to {groupName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter the roster, then bulk-select examiners to add. Already-in-group rows stay marked.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className={cn(formInputClass, "pl-9")}
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className={formLabelClass} htmlFor="ag-source">
                Source
              </label>
              <select
                id="ag-source"
                className={cn(formInputClass, "mt-1")}
                value={source}
                onChange={(e) => setSource(e.target.value as "all" | "regular" | "special")}
              >
                <option value="all">All</option>
                <option value="regular">Regular</option>
                <option value="special">Special</option>
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ag-role">
                Role
              </label>
              <select
                id="ag-role"
                className={cn(formInputClass, "mt-1")}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">All roles</option>
                {EXAMINER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ag-region">
                Region
              </label>
              <select
                id="ag-region"
                className={cn(formInputClass, "mt-1")}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">All regions</option>
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading examiners…
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No examiners match these filters.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {candidates.length}
                  {total > candidates.length ? ` of ${total}` : ""} examiner
                  {candidates.length === 1 ? "" : "s"}
                  {total > PICKER_LIMIT ? ` (capped at ${PICKER_LIMIT})` : ""}
                </span>
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={selectable.length === 0}
                  onClick={() => setSelected(new Set(selectable.map((c) => c.id)))}
                >
                  Select all addable ({selectable.length})
                </button>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {candidates.map((c) => {
                  const inGroup = existingMemberIds.has(c.id);
                  const checked = inGroup || selected.has(c.id);
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm",
                          inGroup ? "bg-muted/30 opacity-70" : "hover:bg-muted/20",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={inGroup || busy}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.id);
                              else next.delete(c.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{c.name}</span>
                          {inGroup ? (
                            <span className="ml-2 text-[11px] font-medium text-muted-foreground">Already in group</span>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {roleAbbrev(c.examiner_type)} · {c.region} · {sourceLabel(c.roster_source)}
                            {c.reference_code ? ` · ${c.reference_code}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={officialAccountsBtnPrimary}
            disabled={busy || selectedCount === 0}
            onClick={() => onAdd([...selected])}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Add selected ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
