"use client";

import { MapPin, Phone } from "lucide-react";

import { ExaminerRoleBadge } from "@/components/subject-officer/examiner-role-badge";
import { regionLabel } from "@/components/subject-officer/subject-officer-examiner-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  examinerType: string;
  region: string;
  phone?: string | null;
  onChange: () => void;
  /** e.g. booklet total or pending count */
  statValue?: number;
  statLabel?: string;
  className?: string;
};

export function SubjectOfficerSelectedExaminerBar({
  name,
  examinerType,
  region,
  phone,
  onChange,
  statValue,
  statLabel,
  className,
}: Props) {
  const displayPhone = phone?.trim() || null;
  const regionText = regionLabel(region);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
            <ExaminerRoleBadge examinerType={examinerType} />
            {statValue != null && statLabel ? (
              <span className="shrink-0 rounded-md border border-border/70 bg-card px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
                {statValue.toLocaleString()} {statLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{regionText}</span>
            </span>
            {displayPhone ? (
              <a
                href={`tel:${displayPhone}`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Phone className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{displayPhone}</span>
              </a>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-3" onClick={onChange}>
          Change
        </Button>
      </div>
    </div>
  );
}
