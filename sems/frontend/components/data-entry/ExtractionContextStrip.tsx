"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileWarning,
  Keyboard,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import type { SubjectCoverageStats } from "@/components/data-entry/SubjectCoverageBanner";

type SelectOption = { value: number; label: string };

interface ExtractionContextStripProps {
  examOptions: SelectOption[];
  subjectOptions: SelectOption[];
  selectedExamId: number | undefined;
  selectedSubjectId: number | undefined;
  onExamChange: (value: string | number | "all" | "") => void;
  onSubjectChange: (value: string | number | "all" | "") => void;
  examLabel: string;
  subjectLabel: string;
  schoolLabel?: string | null;
  canPrevSubject: boolean;
  canNextSubject: boolean;
  onPrevSubject: () => void;
  onNextSubject: () => void;
  coverage: SubjectCoverageStats | null;
  coverageLoading?: boolean;
  coverageError?: string | null;
  selectedTestType?: string;
  onTestTypeFilter: (testType: string | undefined) => void;
  trackHref: string;
  pendingReadyCount: number;
  queuing?: boolean;
  queueDisabled?: boolean;
  onQueueAllReady: () => void;
  subjectsLoading?: boolean;
  allowAllSubjects?: boolean;
  className?: string;
}

function PaperChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium tabular-nums transition-all duration-200",
        "animate-in fade-in-0 zoom-in-95",
        active
          ? "border-amber-600/40 bg-amber-500/15 text-amber-800 shadow-sm dark:text-amber-300"
          : "border-transparent bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 hover:scale-[1.02] dark:text-amber-300"
      )}
      title={`Filter to ${label} paper`}
    >
      {count} {label}
    </button>
  );
}

export function ExtractionContextStrip({
  examOptions,
  subjectOptions,
  selectedExamId,
  selectedSubjectId,
  onExamChange,
  onSubjectChange,
  examLabel,
  subjectLabel,
  schoolLabel,
  canPrevSubject,
  canNextSubject,
  onPrevSubject,
  onNextSubject,
  coverage,
  coverageLoading,
  coverageError,
  selectedTestType,
  onTestTypeFilter,
  trackHref,
  pendingReadyCount,
  queuing,
  queueDisabled,
  onQueueAllReady,
  subjectsLoading,
  allowAllSubjects = false,
  className,
}: ExtractionContextStripProps) {
  const pct =
    coverage && coverage.expected > 0
      ? Math.round((coverage.uploaded / coverage.expected) * 1000) / 10
      : 0;
  const progressValue =
    coverage && coverage.expected > 0
      ? Math.min(100, Math.round((coverage.uploaded / coverage.expected) * 100))
      : 0;

  return (
    <div
      className={cn(
        "sticky top-0 z-20 border-b border-border/80 bg-gradient-to-b from-background via-background/95 to-background/90 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/85",
        "animate-in fade-in-0 slide-in-from-top-2 duration-300",
        className
      )}
    >
      <div className="mx-auto flex max-w-[2000px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-0.5">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="max-w-[220px] truncate rounded-md px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    title="Change examination"
                  >
                    {examLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-2">
                  <SearchableSelect
                    options={examOptions}
                    value={selectedExamId || ""}
                    onValueChange={onExamChange}
                    placeholder="Select examination…"
                    searchPlaceholder="Search examinations..."
                    emptyMessage="No examinations found"
                    triggerClassName="h-8"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground/50">·</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    key={selectedSubjectId ?? "none"}
                    className="max-w-[260px] truncate rounded-md px-2 py-1 text-left text-sm font-medium transition-colors hover:bg-background animate-in fade-in-0 duration-200"
                    title="Change subject"
                  >
                    {subjectLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-2">
                  <SearchableSelect
                    options={subjectOptions}
                    value={
                      selectedSubjectId != null
                        ? selectedSubjectId
                        : allowAllSubjects
                          ? "all"
                          : ""
                    }
                    onValueChange={onSubjectChange}
                    placeholder="Select subject…"
                    disabled={subjectsLoading}
                    allowAll={allowAllSubjects}
                    allLabel="All subjects"
                    searchPlaceholder="Search subject code or name..."
                    emptyMessage="No subjects found"
                    triggerClassName="h-8"
                  />
                </PopoverContent>
              </Popover>
            </div>
            {selectedSubjectId != null ? (
              <div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-background/60 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 transition-transform active:scale-90"
                  disabled={!canPrevSubject}
                  onClick={onPrevSubject}
                  aria-label="Previous subject"
                  title="Previous subject"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 transition-transform active:scale-90"
                  disabled={!canNextSubject}
                  onClick={onNextSubject}
                  aria-label="Next subject"
                  title="Next subject"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {schoolLabel ? (
              <span className="truncate rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
                {schoolLabel}
              </span>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground">
                  <Keyboard className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">j/k · Space · q · Enter</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                j/k or arrows move · Space selects · q queues selection · Enter opens
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {pendingReadyCount > 0 ? (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] animate-in fade-in-0 zoom-in-95"
                onClick={onQueueAllReady}
                disabled={queueDisabled || queuing}
              >
                {queuing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                )}
                Queue all ready ({pendingReadyCount.toLocaleString()})
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground animate-in fade-in-0 duration-200">
                Nothing to queue
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {coverageLoading && !coverage ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking expected sheets…
            </div>
          ) : coverageError && !coverage ? (
            <p className="text-xs text-destructive animate-in fade-in-0 duration-200">
              {coverageError}
            </p>
          ) : coverage ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {coverage.missing > 0 ? (
                  <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : null}
                <span className="font-medium tabular-nums">
                  {coverage.uploaded.toLocaleString()} /{" "}
                  {coverage.expected.toLocaleString()} uploaded
                </span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
                {coverage.missing > 0 ? (
                  <Link
                    href={trackHref}
                    className="font-medium tabular-nums text-amber-700 underline-offset-2 transition-colors hover:underline dark:text-amber-400"
                  >
                    {coverage.missing.toLocaleString()} missing
                  </Link>
                ) : (
                  <span className="text-muted-foreground">All expected uploaded</span>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <PaperChip
                    label="obj"
                    count={coverage.missingObj ?? 0}
                    active={selectedTestType === "1"}
                    onClick={() =>
                      onTestTypeFilter(selectedTestType === "1" ? undefined : "1")
                    }
                  />
                  <PaperChip
                    label="essay"
                    count={coverage.missingEssay ?? 0}
                    active={selectedTestType === "2"}
                    onClick={() =>
                      onTestTypeFilter(selectedTestType === "2" ? undefined : "2")
                    }
                  />
                  <PaperChip
                    label="pract"
                    count={coverage.missingPract ?? 0}
                    active={selectedTestType === "3"}
                    onClick={() =>
                      onTestTypeFilter(selectedTestType === "3" ? undefined : "3")
                    }
                  />
                </div>
                {coverageLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <Progress
                value={progressValue}
                className="h-1.5 max-w-md transition-all duration-500 ease-out"
              />
            </div>
          ) : (
            <div />
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs transition-colors hover:bg-muted/80"
            asChild
          >
            <Link href={trackHref}>
              {coverage && coverage.missing > 0 ? "View missing" : "Track ICMS"}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
