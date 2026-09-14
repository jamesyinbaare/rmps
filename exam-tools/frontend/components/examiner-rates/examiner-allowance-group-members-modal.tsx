"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import {
  OfficialAccountsFilterChips,
  type OfficialAccountsFilterChip,
} from "@/components/official-accounts-filter-chips";
import { listAdminExaminerAllowances, type ExaminerTypeApi } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const PICKER_LIMIT = 500;

const ROLE_OPTIONS = EXAMINER_TYPE_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

const REGION_MULTI_OPTIONS = REGION_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

function sourceLabel(source: string): string {
  if (source === "special" || source === "payout_override") return "Special";
  if (source === "invitation") return "Invitation";
  return "Regular";
}

function roleAbbrev(type: string): string {
  return EXAMINER_TYPE_ABBREVIATIONS[type as ExaminerTypeApi] ?? type;
}

type Candidate = {
  id: string;
  name: string;
  examiner_type: string;
  region: string;
  roster_source: string;
  reference_code?: string | null;
};

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
  const [roles, setRoles] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
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
          role: null,
          region: null,
          skip: 0,
          limit: PICKER_LIMIT,
        });
        if (cancelled) return;
        const nextCandidates = data.items.map((row) => ({
          id: row.id,
          name: row.full_name,
          examiner_type: row.examiner_type,
          region: row.region,
          roster_source: row.roster_source,
          reference_code: row.reference_code,
        }));
        setCandidates(nextCandidates);
        setTotal(data.total);
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
  }, [examinationId, debouncedSearch, source]);

  useEffect(() => {
    const visibleIds = new Set(candidates.map((c) => c.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id) && !existingMemberIds.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [candidates, existingMemberIds]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (roles.length > 0 && !roles.includes(c.examiner_type)) return false;
      if (regions.length > 0 && !regions.includes(c.region)) return false;
      return true;
    });
  }, [candidates, roles, regions]);

  const selectable = useMemo(
    () => filtered.filter((c) => !existingMemberIds.has(c.id)),
    [filtered, existingMemberIds],
  );

  const alreadyInGroupCount = filtered.length - selectable.length;
  const selectedCount = selected.size;

  const filterChips = useMemo((): OfficialAccountsFilterChip[] => {
    const chips: OfficialAccountsFilterChip[] = [];
    for (const role of roles) {
      chips.push({
        id: `role-${role}`,
        label: roleAbbrev(role),
        onRemove: () => setRoles((prev) => prev.filter((r) => r !== role)),
      });
    }
    for (const region of regions) {
      chips.push({
        id: `region-${region}`,
        label: region,
        onRemove: () => setRegions((prev) => prev.filter((r) => r !== region)),
      });
    }
    return chips;
  }, [roles, regions]);

  function clearRoleRegionFilters() {
    setRoles([]);
    setRegions([]);
  }

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
              Pick one or more roles and regions, then select examiners and add them. Already-in-group rows stay
              marked.
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
            <MultiSelectCheckboxDropdown
              id="ag-role"
              label="Role"
              options={ROLE_OPTIONS}
              selected={roles}
              onChange={setRoles}
              allLabel="All roles"
            />
            <MultiSelectCheckboxDropdown
              id="ag-region"
              label="Region"
              options={REGION_MULTI_OPTIONS}
              selected={regions}
              onChange={setRegions}
              allLabel="All regions"
            />
          </div>
          <OfficialAccountsFilterChips
            chips={filterChips}
            onClearAll={clearRoleRegionFilters}
            variant="inline"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading examiners…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No examiners match these filters.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {selectable.length} addable · {alreadyInGroupCount} already in group
                  {total > candidates.length || total > PICKER_LIMIT
                    ? ` · showing ${candidates.length}${total > candidates.length ? ` of ${total}` : ""} loaded`
                    : ""}
                  {total > PICKER_LIMIT ? ` (capped at ${PICKER_LIMIT})` : ""}
                </span>
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={selectable.length === 0}
                  onClick={() => setSelected(new Set(selectable.map((c) => c.id)))}
                >
                  Select all addable ({selectable.length})
                </button>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {filtered.map((c) => {
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
                            <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                              Already in group
                            </span>
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
