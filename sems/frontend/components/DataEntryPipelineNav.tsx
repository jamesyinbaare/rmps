"use client";

import Link from "next/link";
import { CheckCircle2, FileSearch, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type DataEntryPipelineStep = "extract" | "review" | "apply";

const STEPS: Array<{
  id: DataEntryPipelineStep;
  label: string;
  href: string;
  description: string;
  icon: typeof Send;
}> = [
  {
    id: "extract",
    label: "Extract",
    href: "/scores/data-entry/reducto-extraction",
    description: "Queue Reducto",
    icon: Send,
  },
  {
    id: "review",
    label: "Review",
    href: "/scores/data-entry/reducto-extraction?status=success",
    description: "Preview results",
    icon: FileSearch,
  },
  {
    id: "apply",
    label: "Apply",
    href: "/scores/data-entry/apply-scores",
    description: "Write scores",
    icon: CheckCircle2,
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
        "flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 p-1",
        className
      )}
    >
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isCurrent = step.id === current;
        const isPast = index < currentIndex;

        const content = (
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
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
                    ? "bg-green-600 text-white"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {isPast && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <Icon className="hidden h-3.5 w-3.5 sm:inline" />
            <span>
              <span className="block leading-none">{step.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                {step.description}
              </span>
            </span>
          </span>
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
