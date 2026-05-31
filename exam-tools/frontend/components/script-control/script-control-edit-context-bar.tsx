"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { displaySubjectCode } from "@/lib/script-control-completion";
import type { ExaminationScriptSeriesConfigRow, MySchoolScriptControlResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  data: MySchoolScriptControlResponse;
  subject: { subject_id: number; subject_code: string; subject_original_code?: string | null; subject_name: string };
  paperNumber: number;
  recordedSeries: number;
  totalSeries: number;
  queueMode?: boolean;
  canQueueNavigate?: boolean;
  queueBusy?: boolean;
  onNextSchool?: () => void;
  viewBackHref: string;
  saveNotice?: string | null;
  className?: string;
};

export function ScriptControlEditContextBar({
  data,
  subject,
  paperNumber,
  recordedSeries,
  totalSeries,
  queueMode,
  canQueueNavigate,
  queueBusy,
  onNextSchool,
  viewBackHref,
  saveNotice,
  className,
}: Props) {
  const pct = totalSeries > 0 ? Math.round((recordedSeries / totalSeries) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3 lg:sticky lg:top-[var(--staff-sticky-header-offset,4.5rem)] lg:z-10",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <span className="font-mono font-semibold text-foreground">{data.school_code}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-medium text-foreground">{displaySubjectCode(subject)}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Paper {paperNumber}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subject.subject_name}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 min-w-[120px] flex-1 max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
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
          {queueMode ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Queue</span>
          ) : null}
          {canQueueNavigate && onNextSchool ? (
            <Button type="button" size="sm" variant="outline" disabled={queueBusy} onClick={onNextSchool}>
              Next school
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
