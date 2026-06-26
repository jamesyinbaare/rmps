"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapsedSummary?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function CohortCollapsibleSection({
  id,
  title,
  icon: Icon,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  collapsedSummary,
  headerActions,
  className,
  bodyClassName,
  children,
}: Props) {
  const autoId = useId();
  const headingId = id ?? `cohort-section-${autoId}`;
  const panelId = `${headingId}-panel`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;

  function setOpen(next: boolean) {
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <section
      className={cn("flex min-h-0 flex-col", !open && "shrink-0", className)}
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition-colors",
            "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            "-m-1 p-1",
          )}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {Icon ? (
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/60 text-primary">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
              <h3 id={headingId} className="text-sm font-semibold text-foreground">
                {title}
              </h3>
            </div>
            {!open && collapsedSummary ? (
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{collapsedSummary}</div>
            ) : null}
          </div>
        </button>
        {headerActions ? (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
      </div>

      <div
        id={panelId}
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          className={cn(
            "min-h-0",
            open ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
            bodyClassName,
          )}
        >
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
