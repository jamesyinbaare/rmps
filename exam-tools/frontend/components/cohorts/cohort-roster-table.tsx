"use client";

import { useMemo, useState } from "react";

import { Search } from "lucide-react";

import type { CohortRosterMember } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
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

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function CohortRosterTable({ members, className, showReferenceCode = true, tinted = false }: Props) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [members],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((m) => {
      const haystack = [
        m.name,
        regionLabel(m.region),
        EXAMINER_TYPE_LABELS[m.examiner_type as ExaminerTypeApi],
        m.phone_number ?? "",
        m.reference_code ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search, sorted]);

  if (members.length === 0) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        No examiners in this cohort.
      </p>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="relative shrink-0">
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

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No members match your search.</p>
      ) : (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden rounded-lg border",
            tinted ? "border-emerald-500/15 bg-background/70" : "border-border",
          )}
        >
          <div className="max-h-[40vh] overflow-auto">
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
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="hidden text-xs sm:table-cell">Role</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Region</TableHead>
                  {showReferenceCode ? (
                    <TableHead className="hidden text-xs lg:table-cell">Code</TableHead>
                  ) : null}
                  <TableHead className="text-xs">Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m, index) => (
                  <TableRow key={m.id} className="text-sm">
                    <TableCell className="w-10 tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {EXAMINER_TYPE_LABELS[m.examiner_type as ExaminerTypeApi] ?? m.examiner_type}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {regionLabel(m.region)}
                    </TableCell>
                    {showReferenceCode ? (
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {m.reference_code?.trim() || "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {m.phone_number?.trim() ? (
                        <a
                          href={`tel:${m.phone_number.trim()}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.phone_number.trim()}
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
        {filtered.length} of {members.length} member{members.length === 1 ? "" : "s"} shown
      </p>
    </div>
  );
}
