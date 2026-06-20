"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  MapPin,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import { ExaminerQuotaUtilizationBar } from "@/components/examiners/examiner-quota-utilization-bar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type QuotaOutlookScenarioId = "current" | "pending" | "pending_and_waitlisted" | "upload";

type ScenarioOption = {
  value: QuotaOutlookScenarioId;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Users;
};

export const QUOTA_SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    value: "current",
    label: "Current roster",
    shortLabel: "Current",
    description: "Live counts on roster today",
    icon: Users,
  },
  {
    value: "pending",
    label: "add pending",
    shortLabel: "add pending",
    description: "Include outstanding invitations",
    icon: UserPlus,
  },
  {
    value: "pending_and_waitlisted",
    label: "add pending + waitlist",
    shortLabel: "+ waitlist",
    description: "Pending and quota-waitlisted",
    icon: UserPlus,
  },
  {
    value: "upload",
    label: "Test upload",
    shortLabel: "Upload",
    description: "Dry-run a roster file",
    icon: Upload,
  },
];

export type DetailView = "groups" | "regions";

export function QuotaScenarioPicker({
  value,
  onChange,
}: {
  value: QuotaOutlookScenarioId;
  onChange: (value: QuotaOutlookScenarioId) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Quota outlook scenario"
    >
      {QUOTA_SCENARIO_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "flex min-w-[8.5rem] shrink-0 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all sm:min-w-[9.5rem]",
              selected
                ? "border-primary bg-primary/8 shadow-sm ring-1 ring-primary/20"
                : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/20",
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="flex items-center gap-1.5">
              <Icon
                className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className={cn("text-sm font-medium", selected ? "text-foreground" : "text-muted-foreground")}>
                <span className="hidden sm:inline">{option.label}</span>
                <span className="sm:hidden">{option.shortLabel}</span>
              </span>
            </span>
            <span className="hidden text-[11px] leading-snug text-muted-foreground sm:line-clamp-2">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function QuotaDetailViewToggle({
  value,
  onChange,
}: {
  value: DetailView;
  onChange: (value: DetailView) => void;
}) {
  const options: Array<{ value: DetailView; label: string; icon: typeof Layers }> = [
    { value: "groups", label: "By group", icon: Layers },
    { value: "regions", label: "By region", icon: MapPin },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5"
      role="tablist"
      aria-label="Quota breakdown level"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={value === option.value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            <Icon className="size-3.5" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function QuotaOutlookLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 rounded-xl bg-muted/50" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-16 rounded-lg bg-muted/40" />
        <div className="h-16 rounded-lg bg-muted/40" />
        <div className="h-16 rounded-lg bg-muted/40" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-40 rounded-xl bg-muted/40" />
        <div className="h-40 rounded-xl bg-muted/40" />
      </div>
    </div>
  );
}

type HeroProps = {
  title: string;
  count: number;
  cap: number | null | undefined;
  overCap: boolean;
  subtitle?: string;
  delta?: number | null;
  badge?: string;
};

export function QuotaOutlookHero({ title, count, cap, overCap, subtitle, delta, badge }: HeroProps) {
  const fillPct = cap != null && cap > 0 ? Math.round((count / cap) * 100) : null;
  const remaining = cap != null ? cap - count : null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        overCap
          ? "border-destructive/40 bg-linear-to-br from-destructive/8 via-background to-background"
          : "border-border bg-linear-to-br from-primary/5 via-background to-muted/10",
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            {badge ? (
              <Badge variant="secondary" className="font-normal tabular-nums">
                {badge}
              </Badge>
            ) : null}
            {overCap ? (
              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                Over cap
              </Badge>
            ) : cap != null && remaining != null && remaining >= 0 ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                On track
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p
              className={cn(
                "text-4xl font-semibold tabular-nums tracking-tight",
                overCap ? "text-destructive" : "text-foreground",
              )}
            >
              {count.toLocaleString()}
            </p>
            {cap != null ? (
              <p className="pb-1 text-xl font-medium tabular-nums text-muted-foreground">
                / {cap.toLocaleString()}
              </p>
            ) : null}
            {delta != null && delta !== 0 ? (
              <p
                className={cn(
                  "pb-1 text-sm font-medium tabular-nums",
                  delta > 0 ? (overCap ? "text-destructive" : "text-primary") : "text-muted-foreground",
                )}
              >
                {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
              </p>
            ) : null}
            {fillPct != null ? (
              <p className="pb-1 text-sm font-medium tabular-nums text-muted-foreground">{fillPct}% filled</p>
            ) : null}
          </div>

          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}

          {cap != null ? (
            <div className="max-w-md pt-1">
              <ExaminerQuotaUtilizationBar combined={count} quota={cap} overCap={overCap} size="lg" />
            </div>
          ) : null}
        </div>

        {cap != null && remaining != null ? (
          <div
            className={cn(
              "flex shrink-0 flex-col items-center justify-center rounded-xl border px-4 py-3 text-center sm:min-w-[7rem]",
              overCap
                ? "border-destructive/30 bg-destructive/5"
                : remaining <= Math.max(3, Math.ceil(cap * 0.1))
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-emerald-500/25 bg-emerald-500/5",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {overCap ? "Over by" : "Remaining"}
            </p>
            <p
              className={cn(
                "mt-0.5 text-2xl font-semibold tabular-nums",
                overCap ? "text-destructive" : remaining <= Math.max(3, Math.ceil(cap * 0.1)) ? "text-amber-700 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-200",
              )}
            >
              {Math.abs(remaining).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function QuotaOutlookMetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: "default" | "warn" | "danger" | "success" }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-lg border px-3 py-2.5",
            item.tone === "danger" && "border-destructive/30 bg-destructive/5",
            item.tone === "warn" && "border-amber-500/30 bg-amber-500/5",
            item.tone === "success" && "border-emerald-500/25 bg-emerald-500/5",
            (!item.tone || item.tone === "default") && "border-border bg-muted/15",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function QuotaOutlookAlert({
  variant,
  title,
  children,
}: {
  variant: "danger" | "success" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const Icon = variant === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm",
        variant === "danger" && "border border-destructive/50 bg-destructive/10 text-destructive",
        variant === "success" && "border border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100",
        variant === "info" && "border border-dashed border-border bg-muted/20 text-muted-foreground",
      )}
      role={variant === "danger" ? "alert" : undefined}
    >
      {variant !== "info" ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 space-y-1">
        <p className={cn("font-medium", variant === "info" && "text-foreground")}>{title}</p>
        {children}
      </div>
    </div>
  );
}

export function sortGroupsByUrgency<T extends { overCap: boolean; fillPct: number }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.overCap !== b.overCap) return a.overCap ? -1 : 1;
    return b.fillPct - a.fillPct;
  });
}
