"use client";

import { useMemo, useState } from "react";

import { Search } from "lucide-react";

import type { CohortRosterMember } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  members: CohortRosterMember[];
  className?: string;
  showReferenceCode?: boolean;
  /** Subtle tinted table chrome for the view modal. */
  tinted?: boolean;
};

type SortKey = "name" | "role" | "region" | "reference_code" | "phone";
type SortDir = "asc" | "desc";

const filterTriggerClass = "!mt-0 h-9 min-h-9 w-full py-1.5 sm:w-[9.5rem]";

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

function roleLabel(type: ExaminerTypeApi): string {
  return EXAMINER_TYPE_LABELS[type] ?? type;
}

function toggleSort(key: SortKey, activeKey: SortKey, sortDir: SortDir): { key: SortKey; dir: SortDir } {
  if (activeKey === key) {
    return { key, dir: sortDir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}

function compareValues(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "text-foreground",
        className,
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {active ? (
        <span className="text-[10px] text-muted-foreground" aria-hidden>
          {sortDir === "asc" ? "↑" : "↓"}
        </span>
      ) : null}
    </button>
  );
}

export function CohortRosterTable({ members, className, showReferenceCode = true, tinted = false }: Props) {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const regionOptions = useMemo((): MultiSelectCheckboxOption[] => {
    const seen = new Set<string>();
    const options: MultiSelectCheckboxOption[] = [];
    for (const member of members) {
      if (seen.has(member.region)) continue;
      seen.add(member.region);
      options.push({ value: member.region, label: regionLabel(member.region) });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [members]);

  const roleOptions = useMemo((): MultiSelectCheckboxOption[] => {
    const seen = new Set<string>();
    const options: MultiSelectCheckboxOption[] = [];
    for (const member of members) {
      const value = member.examiner_type;
      if (seen.has(value)) continue;
      seen.add(value);
      options.push({
        value,
        label: roleLabel(member.examiner_type as ExaminerTypeApi),
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [members]);

  function handleSort(nextKey: SortKey) {
    const next = toggleSort(nextKey, sortKey, sortDir);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      if (regionFilter.length > 0 && !regionFilter.includes(member.region)) return false;
      if (roleFilter.length > 0 && !roleFilter.includes(member.examiner_type)) return false;
      if (!q) return true;
      const haystack = [
        member.name,
        regionLabel(member.region),
        roleLabel(member.examiner_type as ExaminerTypeApi),
        member.phone_number ?? "",
        member.reference_code ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [members, regionFilter, roleFilter, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareValues(a.name, b.name, sortDir);
        case "role":
          return compareValues(
            roleLabel(a.examiner_type as ExaminerTypeApi),
            roleLabel(b.examiner_type as ExaminerTypeApi),
            sortDir,
          );
        case "region":
          return compareValues(regionLabel(a.region), regionLabel(b.region), sortDir);
        case "reference_code":
          return compareValues(a.reference_code?.trim() ?? "", b.reference_code?.trim() ?? "", sortDir);
        case "phone":
          return compareValues(a.phone_number?.trim() ?? "", b.phone_number?.trim() ?? "", sortDir);
        default:
          return 0;
      }
    });
    return rows;
  }, [filtered, sortDir, sortKey]);

  const activeFilterCount = regionFilter.length + roleFilter.length;

  if (members.length === 0) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        No examiners in this cohort.
      </p>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            className={cn(formInputClass, "h-9 pl-9")}
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search cohort members"
          />
        </div>
        <MultiSelectCheckboxDropdown
          id="cohort-roster-region-filter"
          options={regionOptions}
          selected={regionFilter}
          onChange={setRegionFilter}
          allLabel="All regions"
          disabled={regionOptions.length === 0}
          triggerClassName={filterTriggerClass}
        />
        <MultiSelectCheckboxDropdown
          id="cohort-roster-role-filter"
          options={roleOptions}
          selected={roleFilter}
          onChange={setRoleFilter}
          allLabel="All roles"
          disabled={roleOptions.length === 0}
          triggerClassName={filterTriggerClass}
        />
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No members match your filters.</p>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border",
            tinted ? "border-emerald-500/15 bg-background/70" : "border-border",
          )}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader
                className={cn(
                  "sticky top-0 z-[1] shadow-[0_1px_0_0_hsl(var(--border))]",
                  tinted
                    ? "bg-gradient-to-r from-emerald-500/[0.08] via-primary/[0.05] to-card"
                    : "bg-card",
                )}
              >
                <TableRow>
                  <TableHead className="w-10 text-xs text-muted-foreground">#</TableHead>
                  <TableHead className="text-xs">
                    <SortableHeader
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden text-xs sm:table-cell">
                    <SortableHeader
                      label="Role"
                      sortKey="role"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden text-xs md:table-cell">
                    <SortableHeader
                      label="Region"
                      sortKey="region"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                  {showReferenceCode ? (
                    <TableHead className="hidden text-xs lg:table-cell">
                      <SortableHeader
                        label="Code"
                        sortKey="reference_code"
                        activeKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="text-xs">
                    <SortableHeader
                      label="Phone"
                      sortKey="phone"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((member, index) => (
                  <TableRow key={member.id} className="text-sm">
                    <TableCell className="w-10 tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{member.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {roleLabel(member.examiner_type as ExaminerTypeApi)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {regionLabel(member.region)}
                    </TableCell>
                    {showReferenceCode ? (
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {member.reference_code?.trim() || "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {member.phone_number?.trim() ? (
                        <a
                          href={`tel:${member.phone_number.trim()}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {member.phone_number.trim()}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <p className="shrink-0 text-xs text-muted-foreground">
        {sorted.length} of {members.length} member{members.length === 1 ? "" : "s"} shown
        {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active` : ""}
      </p>
    </div>
  );
}
