"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  title: string;
  description?: string;
  defaultExpanded?: boolean;
  /** Compact summary when collapsed */
  collapsedSummary?: ReactNode;
  headerActions?: ReactNode;
  active?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function ScriptsAllocationCollapsibleCard({
  id,
  title,
  description,
  defaultExpanded = true,
  collapsedSummary,
  headerActions,
  active = false,
  className,
  bodyClassName,
  children,
}: Props) {
  const autoId = useId();
  const headingId = id ?? `allocation-card-${autoId}`;
  const panelId = `${headingId}-panel`;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-sm",
        active ? "border-primary/30 ring-1 ring-primary/10" : "border-border",
        className,
      )}
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2 p-5 md:p-6">
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left transition-colors",
            "hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            expanded ? "-m-1 flex-1 p-1" : "-m-1 p-1",
          )}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-base font-semibold tracking-tight text-card-foreground">
              {title}
            </h2>
            {expanded && description ? (
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
            ) : null}
            {!expanded && collapsedSummary ? (
              <div className="mt-1.5 text-sm text-muted-foreground">{collapsedSummary}</div>
            ) : null}
          </div>
        </button>
        {expanded && headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">{headerActions}</div>
        ) : null}
      </div>
      {expanded ? (
        <div
          id={panelId}
          className={cn("border-t border-border/80 px-5 pb-5 md:px-6 md:pb-6", bodyClassName)}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
