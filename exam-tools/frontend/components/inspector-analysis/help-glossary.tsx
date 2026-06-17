"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  variant: "staffing" | "pay_variance";
  activeRatio?: number;
  className?: string;
};

export function InspectorAnalysisHelpGlossary({ variant, activeRatio = 300, className }: Props) {
  return (
    <details className={cn("group rounded-xl border border-border/70 bg-card shadow-sm", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span>How this report works</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        {variant === "staffing" ? (
          <>
            <p>
              <strong className="text-foreground">Required</strong> = ceil(candidates ÷ {activeRatio}) using your
              candidates-per-inspector rule.
            </p>
            <p>
              <strong className="text-foreground">Staffing variance</strong> = paid unique phones minus required.
              Positive (red) = over-staffed; negative (amber) = under-staffed; zero (green) = exact match.
            </p>
            <p>
              <strong className="text-foreground">Payroll gaps</strong> = centres with posted system inspectors whose
              phones are not on the payroll roster.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong className="text-foreground">Days variance</strong> = max assigned roster days minus timetable
              exam days at the centre.
            </p>
            <p>
              <strong className="text-foreground">Days pay variance</strong> = roster pay at assigned days minus pay if
              each paid inspector worked exactly exam days.
            </p>
            <p>
              <strong className="text-foreground">Payroll vs posted</strong> = actual roster pay minus hypothetical pay
              for posted headcount at exam-day rates.
            </p>
          </>
        )}
        <p className="text-muted-foreground">
          Variance colours: red = higher than baseline, amber = lower, green = match.
        </p>
      </div>
    </details>
  );
}
