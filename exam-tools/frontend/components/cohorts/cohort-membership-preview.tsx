"use client";

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import { computeMembershipPreview } from "@/components/cohorts/cohort-membership-preview-utils";
import type { MembershipExaminer } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExaminerTypeApi } from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  examiners: MembershipExaminer[];
  membersDraft: Record<string, boolean>;
  regionsDraft: Record<string, boolean>;
  rolesDraft: Record<string, boolean>;
  className?: string;
};

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

function SourceBadges({ sources }: { sources: ("region" | "role" | "manual")[] }) {
  if (sources.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <Badge
          key={s}
          variant={s === "manual" ? "outline" : "secondary"}
          className="text-[10px] font-normal"
        >
          {s === "region" ? "Region" : s === "role" ? "Role" : "Manual"}
        </Badge>
      ))}
      {sources.length > 1 ? (
        <span className="self-center text-[10px] text-muted-foreground">multiple rules</span>
      ) : null}
    </div>
  );
}

/** Expanded preview height — capped on smaller viewports so the modal body keeps room for membership. */
const PREVIEW_EXPANDED_HEIGHT =
  "max-lg:max-h-[min(28vh,12rem)] lg:min-h-[45vh] lg:max-h-[45vh]";

export function CohortMembershipPreview({
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const breakdown = computeMembershipPreview(
    examiners,
    membersDraft,
    regionsDraft,
    rolesDraft,
  );

  if (breakdown.rows.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-muted/20 transition-[min-height,max-height] duration-300 ease-out motion-reduce:transition-none",
        open && PREVIEW_EXPANDED_HEIGHT,
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full shrink-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">
          Preview ({breakdown.rows.length} examiner
          {breakdown.rows.length === 1 ? "" : "s"})
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {breakdown.viaRegion > 0 ? `${breakdown.viaRegion} via region` : null}
          {breakdown.viaRegion > 0 && breakdown.viaRole > 0 ? " · " : null}
          {breakdown.viaRole > 0 ? `${breakdown.viaRole} via role` : null}
          {(breakdown.viaRegion > 0 || breakdown.viaRole > 0) && breakdown.manualOnly > 0
            ? " · "
            : null}
          {breakdown.manualOnly > 0 ? `${breakdown.manualOnly} manual` : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "min-h-0 flex-1 grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-border">
          <Table>
            <TableHeader className="sticky top-0 z-1 bg-muted/40 shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="h-8 w-10 text-xs text-muted-foreground">#</TableHead>
                <TableHead className="h-8 text-xs">Name</TableHead>
                <TableHead className="hidden h-8 text-xs sm:table-cell">Region</TableHead>
                <TableHead className="hidden h-8 text-xs md:table-cell">Role</TableHead>
                <TableHead className="h-8 text-xs">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.rows.map((row, index) => (
                <TableRow key={row.id} className="text-xs">
                  <TableCell className="w-10 py-1.5 tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="py-1.5 font-medium text-foreground">
                    {row.name}
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-muted-foreground sm:table-cell">
                    {regionLabel(row.region)}
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-muted-foreground md:table-cell">
                    {EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ??
                      row.examiner_type}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <SourceBadges sources={row.sources} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
