"use client";

import { MapPin } from "lucide-react";
import { useMemo } from "react";

import { ExaminerQuotaUtilizationBar } from "@/components/examiners/examiner-quota-utilization-bar";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import { Badge } from "@/components/ui/badge";
import type { SubjectExaminerRegionBreakdownRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  rows: SubjectExaminerRegionBreakdownRow[];
  projectionMode?: boolean;
  regionFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
};

type GroupSection = {
  groupId: string;
  groupName: string;
  groupQuota: number | null | undefined;
  groupCurrent: number;
  groupCombined: number;
  groupOverCap: boolean;
  regions: SubjectExaminerRegionBreakdownRow[];
};

function groupSections(rows: SubjectExaminerRegionBreakdownRow[]): GroupSection[] {
  const map = new Map<string, GroupSection>();
  for (const row of rows) {
    let section = map.get(row.group_id);
    if (!section) {
      section = {
        groupId: row.group_id,
        groupName: row.group_name,
        groupQuota: row.group_quota,
        groupCurrent: row.group_current_count,
        groupCombined: row.group_combined_count,
        groupOverCap: row.group_over_cap,
        regions: [],
      };
      map.set(row.group_id, section);
    }
    section.regions.push(row);
  }
  return [...map.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function RegionShareBar({
  count,
  groupTotal,
  highlight,
}: {
  count: number;
  groupTotal: number;
  highlight?: boolean;
}) {
  if (groupTotal <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct = Math.min(100, Math.round((count / groupTotal) * 100));
  return (
    <div className="flex min-w-24 flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            highlight ? "bg-primary" : "bg-primary/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{pct}% of group</span>
    </div>
  );
}

export function ExaminerQuotaRegionBreakdownView({
  rows,
  projectionMode = false,
  regionFilter,
  onRegionFilterChange,
}: Props) {
  const regionOptions = useMemo((): MultiSelectCheckboxOption[] => {
    const seen = new Set<string>();
    const options: MultiSelectCheckboxOption[] = [];
    for (const row of rows) {
      if (seen.has(row.region)) continue;
      seen.add(row.region);
      options.push({ value: row.region, label: row.region });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (regionFilter.length === 0) return rows;
    const allowed = new Set(regionFilter);
    return rows.filter((r) => allowed.has(r.region));
  }, [regionFilter, rows]);

  const sections = useMemo(() => groupSections(filteredRows), [filteredRows]);

  const filteredRegionCount = filteredRows.length;
  const totalRegionCount = rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/15 p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Filter by region</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Caps apply to the whole group; regions show how the roster is distributed within each group.
          </p>
          <div className="mt-2">
            <MultiSelectCheckboxDropdown
              id="quota-outlook-region-filter"
              label="Regions"
              options={regionOptions}
              selected={regionFilter}
              onChange={onRegionFilterChange}
              allLabel="All regions"
            />
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
          {regionFilter.length > 0
            ? `${filteredRegionCount} of ${totalRegionCount} regions`
            : `${totalRegionCount} regions`}
        </Badge>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No regions match your filter.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const groupCount = projectionMode ? section.groupCombined : section.groupCurrent;
            return (
              <section
                key={section.groupId}
                className={cn(
                  "overflow-hidden rounded-xl border shadow-sm",
                  section.groupOverCap
                    ? "border-destructive/50 bg-destructive/3"
                    : "border-border bg-background",
                )}
              >
                <div className="border-b border-border/80 bg-muted/25 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground">{section.groupName}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Group cap shared across {section.regions.length} region
                        {section.regions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 tabular-nums",
                        section.groupOverCap &&
                          "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
                      )}
                    >
                      {groupCount} on roster
                      {section.groupQuota != null ? ` / ${section.groupQuota}` : ""}
                    </Badge>
                  </div>
                  {section.groupQuota != null ? (
                    <div className="mt-3 max-w-md">
                      <ExaminerQuotaUtilizationBar
                        combined={groupCount}
                        quota={section.groupQuota}
                        overCap={section.groupOverCap}
                      />
                    </div>
                  ) : null}
                </div>

                <ul className="divide-y divide-border/70">
                  {section.regions.map((row) => {
                    const displayCount = projectionMode ? row.combined_count : row.current_count;
                    const groupBase = projectionMode ? section.groupCombined : section.groupCurrent;
                    return (
                      <li
                        key={row.region}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{row.region}</p>
                            {projectionMode && row.proposed_count > 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.current_count} now ·{" "}
                                <span className="text-primary">+{row.proposed_count} pending</span>
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.current_count} examiner{row.current_count === 1 ? "" : "s"} on roster
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                          {projectionMode ? (
                            <div className="flex items-center gap-3 text-sm tabular-nums">
                              <span className="text-muted-foreground">{row.current_count}</span>
                              {row.proposed_count > 0 ? (
                                <span className="text-primary">+{row.proposed_count}</span>
                              ) : null}
                              <span
                                className={cn(
                                  "font-medium",
                                  section.groupOverCap && row.proposed_count > 0 && "text-destructive",
                                )}
                              >
                                → {row.combined_count}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-medium tabular-nums">{displayCount}</span>
                          )}
                          <RegionShareBar
                            count={displayCount}
                            groupTotal={groupBase}
                            highlight={row.proposed_count > 0}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
