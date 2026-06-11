"use client";

import { useMemo, useState } from "react";

import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { MembershipExaminer } from "@/components/cohorts/types";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type Props = {
  examiners: MembershipExaminer[];
  membersDraft: Record<string, boolean>;
  regionsDraft: Record<string, boolean>;
  rolesDraft: Record<string, boolean>;
  unassignedOnly: boolean;
  onUnassignedOnlyChange: (v: boolean) => void;
  unassignedIds: Set<string>;
  disabled?: boolean;
  onToggle: (examinerId: string, checked: boolean) => void;
  regionsOverrideWarning?: string;
};

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function IndividualMemberPicker({
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
  unassignedOnly,
  onUnassignedOnlyChange,
  unassignedIds,
  disabled = false,
  onToggle,
  regionsOverrideWarning,
}: Props) {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");

  const activeRegionRules = useMemo(
    () => Object.entries(regionsDraft).filter(([, v]) => v).map(([k]) => k),
    [regionsDraft],
  );
  const activeRoleRules = useMemo(
    () => Object.entries(rolesDraft).filter(([, v]) => v).map(([k]) => k),
    [rolesDraft],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return examiners.filter((ex) => {
      if (unassignedOnly && !unassignedIds.has(ex.id)) return false;
      if (regionFilter && ex.region !== regionFilter) return false;
      if (!q) return true;
      const roleLabel = EXAMINER_TYPE_LABELS[ex.examiner_type] ?? ex.examiner_type;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.region.toLowerCase().includes(q) ||
        roleLabel.toLowerCase().includes(q)
      );
    });
  }, [examiners, regionFilter, search, unassignedIds, unassignedOnly]);

  const includedViaRule = (ex: MembershipExaminer): string | null => {
    if (activeRegionRules.includes(ex.region)) {
      return `Included via ${regionLabel(ex.region)} region`;
    }
    if (activeRoleRules.includes(ex.examiner_type)) {
      return `Included via ${EXAMINER_TYPE_LABELS[ex.examiner_type]} role`;
    }
    return null;
  };

  if (examiners.length === 0) {
    return <p className="text-sm text-muted-foreground">No examiners available.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {regionsOverrideWarning ? (
        <p className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {regionsOverrideWarning}
        </p>
      ) : null}
      <div className="flex shrink-0 flex-wrap gap-2">
        <input
          type="search"
          className={cn(formInputClass, "h-9 min-w-40 flex-1")}
          placeholder="Search by name, region, role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search examiners"
        />
        <select
          className={cn(formInputClass, "h-9 w-auto min-w-32")}
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          aria-label="Filter by region"
        >
          <option value="">All regions</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => onUnassignedOnlyChange(e.target.checked)}
          />
          Unassigned only
        </label>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-sm text-muted-foreground">No examiners match filters.</li>
        ) : (
          filtered.map((ex) => {
            const viaRule = includedViaRule(ex);
            return (
              <li key={ex.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className={cn("mt-0.5 shrink-0", inputFocusRing)}
                    checked={membersDraft[ex.id] ?? false}
                    disabled={disabled}
                    onChange={(e) => onToggle(ex.id, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="text-foreground">{ex.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {regionLabel(ex.region)} ·{" "}
                      {EXAMINER_TYPE_LABELS[ex.examiner_type as ExaminerTypeApi]}
                    </span>
                    {viaRule ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{viaRule}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
