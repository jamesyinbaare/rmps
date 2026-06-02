"use client";

import { Info, Phone, type LucideIcon, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CentreSummaryDetailModal,
  CentreSummaryModalPanel,
} from "@/components/centre-summary-detail-modal";
import type { AssignedInspectorAtCentre, TimetableSubjectFilter } from "@/lib/api";
import { cn } from "@/lib/utils";

function subjectScopeLabel(filter: TimetableSubjectFilter): string {
  if (filter === "CORE_ONLY") return "Core";
  if (filter === "ELECTIVE_ONLY") return "Elective";
  return "All";
}

type InspectorTheme = {
  modalAccent: string;
  icon: string;
};

function inspectorInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function InspectorRowCard({
  inspector,
  index,
  theme,
}: {
  inspector: AssignedInspectorAtCentre;
  index: number;
  theme: InspectorTheme;
}) {
  const phone = inspector.phone?.trim();
  const initials = inspectorInitials(inspector.full_name);

  return (
    <li
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 shadow-sm transition-colors",
        "hover:border-border hover:bg-muted/20",
        "ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold tracking-wide shadow-sm",
          theme.icon,
        )}
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{inspector.full_name}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3 shrink-0 opacity-70" aria-hidden />
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="truncate tabular-nums text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline"
            >
              {phone}
            </a>
          ) : (
            <span className="italic">No phone on file</span>
          )}
        </div>
      </div>
      <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 sm:inline">
        #{index + 1}
      </span>
    </li>
  );
}

function InspectorModalLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading inspectors">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <div className="size-10 animate-pulse rounded-xl bg-muted/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorModalEmpty({ theme }: { theme: InspectorTheme }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/15 px-6 py-10 text-center">
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-border/50",
          theme.icon,
        )}
        aria-hidden
      >
        <UserCheck className="size-7" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">No inspectors assigned</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          No one has been posted to this centre for this exam and subject scope yet.
        </p>
      </div>
    </div>
  );
}

function AssignedInspectorsModal({
  open,
  onClose,
  centreLabel,
  subjectFilter,
  inspectors,
  refreshing,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  centreLabel: string;
  subjectFilter: TimetableSubjectFilter;
  inspectors: AssignedInspectorAtCentre[];
  refreshing?: boolean;
  theme: InspectorTheme;
}) {
  const count = inspectors.length;

  return (
    <CentreSummaryDetailModal
      open={open}
      onClose={onClose}
      title="Assigned inspectors"
      centreLabel={centreLabel}
      scopeLabel={subjectScopeLabel(subjectFilter)}
      icon={UserCheck}
      iconClassName={theme.icon}
      headerAccentClassName={theme.modalAccent}
      contentClassName="bg-muted/10"
      footer={
        <div className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary/70" aria-hidden />
          <p>
            {count > 0 && !refreshing
              ? "These are the inspectors posted to this centre for this exam, for the subject scope you've selected."
              : "We only show inspectors posted to this centre for this exam — not everyone in the inspector directory."}
          </p>
        </div>
      }
    >
      {refreshing ? <InspectorModalLoading /> : null}
      {!refreshing && count === 0 ? <InspectorModalEmpty theme={theme} /> : null}
      {!refreshing && count > 0 ? (
        <CentreSummaryModalPanel className="border-none bg-transparent p-0 shadow-none ring-0">
          <ul className="space-y-2">
            {inspectors.map((insp, index) => (
              <InspectorRowCard key={insp.inspector_id} inspector={insp} index={index} theme={theme} />
            ))}
          </ul>
        </CentreSummaryModalPanel>
      ) : null}
    </CentreSummaryDetailModal>
  );
}

type BreakdownProps = {
  inspectors: AssignedInspectorAtCentre[];
  centreLabel: string;
  subjectFilter: TimetableSubjectFilter;
  refreshing?: boolean;
  theme: InspectorTheme;
  variant?: "link" | "tile";
  icon?: LucideIcon;
  label?: string;
  hint?: string;
};

export function AssignedInspectorsBreakdown({
  inspectors,
  centreLabel,
  subjectFilter,
  refreshing = false,
  theme,
  variant = "link",
  icon: Icon = UserCheck,
  label = "Assigned inspectors",
  hint,
}: BreakdownProps) {
  const [open, setOpen] = useState(false);
  const count = inspectors.length;
  const tileHint = hint ?? `${count} assigned`;

  useEffect(() => {
    setOpen(false);
  }, [subjectFilter, centreLabel]);

  const trigger =
    variant === "tile" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-left shadow-sm transition-all hover:border-border hover:bg-muted/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md shadow-sm transition-colors",
            count > 0 ? theme.icon : "bg-muted/80 text-muted-foreground",
            "group-hover:scale-[1.02]",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">{label}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{tileHint}</span>
        </span>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
            count > 0 ? theme.icon : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      </button>
    ) : (
      <button
        type="button"
        className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        {label} ({count})
      </button>
    );

  return (
    <>
      {trigger}
      <AssignedInspectorsModal
        open={open}
        onClose={() => setOpen(false)}
        centreLabel={centreLabel}
        subjectFilter={subjectFilter}
        inspectors={inspectors}
        refreshing={refreshing && open}
        theme={theme}
      />
    </>
  );
}
