"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AbsentReviewCandidateGroup } from "@/types/document";

const PAPER_LABEL: Record<number, string> = {
  1: "Obj",
  2: "Essay",
  3: "Pract",
};

function formatScore(total: number | null | undefined, isFullyAbsent: boolean): string {
  if (isFullyAbsent) return "ABSENT";
  if (total == null) return "—";
  return String(total);
}

export interface AbsentReviewInspectPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: AbsentReviewCandidateGroup | null;
  confirming?: boolean;
  openingSheets?: boolean;
  onConfirmAll?: () => void;
  onOpenSheets?: () => void;
}

export function AbsentReviewInspectPanel({
  open,
  onOpenChange,
  group,
  confirming = false,
  openingSheets = false,
  onConfirmAll,
  onOpenSheets,
}: AbsentReviewInspectPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        {group ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono tabular-nums">
                {group.candidate_index_number}
              </SheetTitle>
              <SheetDescription>
                {group.candidate_name}
                {group.school_name
                  ? ` · ${group.school_code ? `${group.school_code} · ` : ""}${group.school_name}`
                  : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] uppercase tracking-wide",
                  group.bucket === "fully_absent"
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-300 bg-slate-50 text-slate-700"
                )}
              >
                {group.bucket === "fully_absent" ? "Fully absent" : "Mixed"}
              </Badge>
              <span>
                {group.registered_subject_count}{" "}
                {group.registered_subject_count === 1 ? "subject" : "subjects"}
              </span>
              <span>·</span>
              <span>
                {group.pending_paper_count}{" "}
                {group.pending_paper_count === 1 ? "pending paper" : "pending papers"}
              </span>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {group.bucket === "fully_absent"
                ? "Absent on every registered subject — safe to confirm without opening sheets."
                : "Has scores on some subjects and absences on others — check before confirming."}
            </p>

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto">
              {group.subjects.map((subject) => (
                <div
                  key={subject.subject_id}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    subject.is_fully_absent
                      ? "border-amber-200 bg-amber-50/70"
                      : subject.total_score != null
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-muted bg-muted/30"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {subject.subject_code} · {subject.subject_name}
                    </span>
                    <span className="tabular-nums text-xs opacity-80">
                      {formatScore(subject.total_score, subject.is_fully_absent)}
                      {subject.grade ? ` ${subject.grade}` : ""}
                    </span>
                  </div>
                  {subject.pending_papers.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pending:{" "}
                      {subject.pending_papers
                        .map(
                          (p) =>
                            `${PAPER_LABEL[p.test_type] ?? p.test_type} (${p.absent_marker})`
                        )
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <SheetFooter className="mt-4 flex-row flex-wrap gap-2 sm:justify-end">
              {group.bucket === "fully_absent" && onConfirmAll ? (
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={confirming}
                  onClick={onConfirmAll}
                >
                  {confirming ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Confirm all absences
                </Button>
              ) : null}
              {onOpenSheets ? (
                <Button
                  variant="outline"
                  disabled={openingSheets}
                  onClick={onOpenSheets}
                >
                  {openingSheets ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Open sheets
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
