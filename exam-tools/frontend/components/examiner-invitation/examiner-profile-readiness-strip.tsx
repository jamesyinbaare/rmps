"use client";

import {
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileDown,
  UtensilsCrossed,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ProfileReadinessItem = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  pending?: boolean;
  hidden?: boolean;
};

type Props = {
  items: ProfileReadinessItem[];
  className?: string;
};

function scrollToProfileSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const ITEM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  lunch: UtensilsCrossed,
  bank: Building2,
  scripts: ClipboardList,
  letter: FileDown,
};

export function ExaminerProfileReadinessStrip({ items, className }: Props) {
  const visible = items.filter((item) => !item.hidden);
  if (visible.length === 0) return null;

  const completedCount = visible.filter((item) => item.complete).length;

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm sm:p-5",
        className,
      )}
      aria-labelledby="profile-readiness-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="profile-readiness-title" className="text-sm font-semibold text-foreground">
            Your checklist
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {completedCount} of {visible.length} complete
          </p>
        </div>
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 text-xs font-semibold tabular-nums text-foreground"
          aria-hidden
        >
          {completedCount}/{visible.length}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {visible.map((item) => {
          const Icon = ITEM_ICONS[item.id] ?? Circle;
          const StatusIcon = item.complete ? CheckCircle2 : Circle;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => scrollToProfileSection(`profile-${item.id}`)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  item.complete
                    ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                    : item.pending
                      ? "border-amber-500/25 bg-amber-500/[0.06]"
                      : "border-border/70 bg-muted/15",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    item.complete
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : item.pending
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <StatusIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        item.complete
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground/70",
                      )}
                      aria-hidden
                    />
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
