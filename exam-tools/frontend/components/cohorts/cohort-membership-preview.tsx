"use client";

import { useEffect, useState } from "react";

import { ChevronUp, Users, X } from "lucide-react";

import { computeMembershipPreview } from "@/components/cohorts/cohort-membership-preview-utils";
import type { MembershipExaminer } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type PreviewData = {
  examiners: MembershipExaminer[];
  membersDraft: Record<string, boolean>;
  regionsDraft: Record<string, boolean>;
  rolesDraft: Record<string, boolean>;
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

function PreviewTable({ rows }: { rows: ReturnType<typeof computeMembershipPreview>["rows"] }) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
        <TableRow>
          <TableHead className="h-8 w-10 text-xs text-muted-foreground">#</TableHead>
          <TableHead className="h-8 text-xs">Name</TableHead>
          <TableHead className="hidden h-8 text-xs sm:table-cell">Region</TableHead>
          <TableHead className="hidden h-8 text-xs md:table-cell">Role</TableHead>
          <TableHead className="h-8 text-xs">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.id} className="text-xs">
            <TableCell className="w-10 py-1.5 tabular-nums text-muted-foreground">
              {index + 1}
            </TableCell>
            <TableCell className="py-1.5 font-medium text-foreground">{row.name}</TableCell>
            <TableCell className="hidden py-1.5 text-muted-foreground sm:table-cell">
              {regionLabel(row.region)}
            </TableCell>
            <TableCell className="hidden py-1.5 text-muted-foreground md:table-cell">
              {EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type}
            </TableCell>
            <TableCell className="py-1.5">
              <SourceBadges sources={row.sources} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function useMembershipPreviewBreakdown({
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
}: PreviewData) {
  return computeMembershipPreview(examiners, membersDraft, regionsDraft, rolesDraft);
}

export function CohortMembershipPreviewTrigger({
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
  onOpen,
  className,
}: PreviewData & { onOpen: () => void; className?: string }) {
  const breakdown = useMembershipPreviewBreakdown({
    examiners,
    membersDraft,
    regionsDraft,
    rolesDraft,
  });

  if (breakdown.rows.length === 0) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-8 gap-1.5", className)}
      onClick={onOpen}
    >
      <Users className="h-3.5 w-3.5" aria-hidden />
      Preview {breakdown.rows.length} examiner{breakdown.rows.length === 1 ? "" : "s"}
    </Button>
  );
}

export function CohortMembershipPreviewOverlay({
  open,
  onOpenChange,
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
}: PreviewData & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const breakdown = useMembershipPreviewBreakdown({
    examiners,
    membersDraft,
    regionsDraft,
    rolesDraft,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open || breakdown.rows.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end motion-reduce:animate-none"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Membership preview"
        className={cn(
          "pointer-events-auto relative flex max-h-[min(72vh,28rem)] min-h-[min(50vh,18rem)] flex-col",
          "rounded-t-2xl border border-border bg-card shadow-[0_-8px_30px_-4px_rgba(0,0,0,0.15)]",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              Membership preview ({breakdown.rows.length})
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {breakdown.viaRegion > 0 ? `${breakdown.viaRegion} via region` : null}
              {breakdown.viaRegion > 0 && breakdown.viaRole > 0 ? " · " : null}
              {breakdown.viaRole > 0 ? `${breakdown.viaRole} via role` : null}
              {(breakdown.viaRegion > 0 || breakdown.viaRole > 0) && breakdown.manualOnly > 0
                ? " · "
                : null}
              {breakdown.manualOnly > 0 ? `${breakdown.manualOnly} manual` : null}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close preview"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 pt-1">
          <PreviewTable rows={breakdown.rows} />
        </div>
        <div className="flex shrink-0 justify-center border-t border-border px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
            Close preview
          </Button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Inline expansion — use Trigger + Overlay instead. */
export function CohortMembershipPreview({
  examiners,
  membersDraft,
  regionsDraft,
  rolesDraft,
  className,
}: PreviewData & { compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const breakdown = useMembershipPreviewBreakdown({
    examiners,
    membersDraft,
    regionsDraft,
    rolesDraft,
  });

  if (breakdown.rows.length === 0) return null;

  return (
    <>
      <CohortMembershipPreviewTrigger
        examiners={examiners}
        membersDraft={membersDraft}
        regionsDraft={regionsDraft}
        rolesDraft={rolesDraft}
        onOpen={() => setOpen(true)}
        className={className}
      />
      <CohortMembershipPreviewOverlay
        open={open}
        onOpenChange={setOpen}
        examiners={examiners}
        membersDraft={membersDraft}
        regionsDraft={regionsDraft}
        rolesDraft={rolesDraft}
      />
    </>
  );
}
