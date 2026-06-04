"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScriptControlSchoolIdentity } from "@/components/script-control/script-control-school-identity";
import { displaySubjectCode } from "@/lib/script-control-completion";
import type { MySchoolScriptControlResponse } from "@/lib/api";
import {
  getPaperInspectorVisuals,
  paperEditContextBarClass,
  paperEditContextBarTintClass,
  paperEditToggleActiveClass,
} from "@/lib/paper-inspector-styles";
import { cn } from "@/lib/utils";

const PAPER_OPTIONS = [
  { value: 1 as const, label: "Paper 1" },
  { value: 2 as const, label: "Paper 2" },
];

type Props = {
  data: MySchoolScriptControlResponse;
  subject: { subject_id: number; subject_code: string; subject_original_code?: string | null; subject_name: string };
  paperNumber: number;
  recordedSeries: number;
  totalSeries: number;
  onNextSeries?: () => void;
  canNextSeries?: boolean;
  actionBusy?: boolean;
  viewBackHref: string;
  saveNotice?: string | null;
  schoolName?: string | null;
  className?: string;
  onFindSchool?: () => void;
  onChangeSubject?: () => void;
  onPaperChange?: (paper: 1 | 2) => void;
};

export function ScriptControlEditContextBar({
  data,
  subject,
  paperNumber,
  recordedSeries,
  totalSeries,
  onNextSeries,
  canNextSeries,
  actionBusy,
  viewBackHref,
  saveNotice,
  schoolName,
  className,
  onFindSchool,
  onChangeSubject,
  onPaperChange,
}: Props) {
  const pct = totalSeries > 0 ? Math.round((recordedSeries / totalSeries) * 100) : 0;
  const paperVisuals = getPaperInspectorVisuals(paperNumber);
  const progressBarClass =
    paperNumber === 1 ? "bg-accent" : paperNumber === 2 ? "bg-success" : "bg-primary";

  const tintClass = paperEditContextBarTintClass(paperNumber);

  return (
    <div
      className={cn(
        "sticky top-[var(--staff-sticky-header-offset,4.5rem)] z-20 isolate min-w-0 max-w-full rounded-xl border border-border bg-card px-4 py-3 shadow-sm lg:top-[var(--staff-sticky-header-offset,4.5rem)]",
        paperEditContextBarClass(paperNumber),
        className,
      )}
    >
      {tintClass ? (
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-xl", tintClass)} />
      ) : null}
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <ScriptControlSchoolIdentity
            schoolCode={data.school_code}
            schoolName={schoolName ?? data.school_name}
            centreCode={data.examination_centre_code}
            centreName={data.examination_centre_name}
            postedInspectors={data.posted_inspectors ?? []}
            onChangeSchool={onFindSchool}
            className="mb-2"
          />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
            {onChangeSubject ? (
              <button
                type="button"
                className="font-medium text-foreground underline decoration-primary/40 underline-offset-2 hover:text-primary lg:no-underline lg:hover:text-foreground"
                onClick={onChangeSubject}
              >
                {displaySubjectCode(subject)}
              </button>
            ) : (
              <span className="font-medium text-foreground">{displaySubjectCode(subject)}</span>
            )}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {onPaperChange ? (
              <div
                className={cn(
                  "flex gap-0.5 rounded-lg border p-0.5",
                  paperNumber === 1 ? "border-accent/30 bg-accent/5" : "border-success/30 bg-success/5",
                )}
                role="group"
                aria-label="Switch paper"
              >
                {PAPER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "min-h-9 rounded-md px-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                      paperNumber === opt.value
                        ? paperEditToggleActiveClass(opt.value)
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={paperNumber === opt.value}
                    onClick={() => {
                      if (paperNumber !== opt.value) onPaperChange(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className={paperVisuals.badgeClass}>Paper {paperNumber}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subject.subject_name}</p>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", progressBarClass)}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={recordedSeries}
                aria-valuemin={0}
                aria-valuemax={totalSeries}
                aria-label={`${recordedSeries} of ${totalSeries} series recorded`}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {recordedSeries}/{totalSeries} series
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {saveNotice ? <span className="text-sm text-muted-foreground">{saveNotice}</span> : null}
          {canNextSeries && onNextSeries ? (
            <Button type="button" size="sm" variant="default" disabled={actionBusy} onClick={onNextSeries}>
              Next series
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href={viewBackHref}>View grid</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
