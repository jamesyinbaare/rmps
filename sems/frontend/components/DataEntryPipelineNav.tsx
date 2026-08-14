"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DataEntryPipelineStep = "extract" | "review" | "apply";

const STEPS: Array<{
  id: DataEntryPipelineStep;
  label: string;
  href: string;
  description: string;
}> = [
  {
    id: "extract",
    label: "Extract",
    href: "/scores/data-entry/extraction",
    description: "Queue extraction",
  },
  {
    id: "review",
    label: "Review",
    href: "/scores/data-entry/extraction?status=success",
    description: "Preview results",
  },
  {
    id: "apply",
    label: "Apply",
    href: "/scores/data-entry/apply-scores",
    description: "Write scores",
  },
];

interface DataEntryPipelineNavProps {
  current: DataEntryPipelineStep;
  className?: string;
}

export function DataEntryPipelineNav({ current, className }: DataEntryPipelineNavProps) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <nav
      aria-label="Score data entry pipeline"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5",
        className
      )}
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.id === current;
        const isPast = index < currentIndex;

        const content = (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                  isCurrent
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : isPast
                      ? "text-foreground/80 hover:bg-background/60"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isPast
                        ? "bg-primary/80 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isPast && !isCurrent ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{step.description}</TooltipContent>
          </Tooltip>
        );

        if (isCurrent) {
          return (
            <span key={step.id} aria-current="step">
              {content}
            </span>
          );
        }

        return (
          <Link
            key={step.id}
            href={step.href}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
