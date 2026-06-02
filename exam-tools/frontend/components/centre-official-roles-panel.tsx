"use client";

import {
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { FinanceCentreSchoolSummaryRoleCounts, TimetableSubjectFilter } from "@/lib/api";
import { cn } from "@/lib/utils";

type RoleKey = keyof FinanceCentreSchoolSummaryRoleCounts;

type RoleAccent = "primary" | "secondary" | "success" | "amber" | "violet";

type RoleDef = {
  key: RoleKey;
  shortLabel: string;
  fullLabel: string;
  icon: LucideIcon;
  accent: RoleAccent;
};

export const OFFICIAL_ROLE_DEFS: RoleDef[] = [
  {
    key: "external_inspector",
    shortLabel: "Ext. insp.",
    fullLabel: "External Inspector",
    icon: ShieldCheck,
    accent: "primary",
  },
  {
    key: "police_officer",
    shortLabel: "Police",
    fullLabel: "Police Officer",
    icon: Shield,
    accent: "secondary",
  },
  {
    key: "supervisor",
    shortLabel: "Supervisor",
    fullLabel: "Supervisor",
    icon: UserCog,
    accent: "success",
  },
  {
    key: "depot_keeper",
    shortLabel: "Depot",
    fullLabel: "Depot Keeper",
    icon: Warehouse,
    accent: "amber",
  },
  {
    key: "assistant_supervisor",
    shortLabel: "Asst. sup.",
    fullLabel: "Assistant Supervisor",
    icon: Users,
    accent: "violet",
  },
];

function subjectScopeLabel(filter: TimetableSubjectFilter): string {
  if (filter === "CORE_ONLY") return "Core";
  if (filter === "ELECTIVE_ONLY") return "Elective";
  return "All";
}

function roleAccentStyles(accent: RoleAccent, hasCount: boolean, selected: boolean, interactive: boolean) {
  const filled = hasCount || selected;

  const palettes: Record<
    RoleAccent,
    {
      tile: string;
      tileFilled: string;
      icon: string;
      iconMuted: string;
      count: string;
      selectedRing: string;
      hover: string;
    }
  > = {
    primary: {
      tile: "border-border/50 bg-background/50",
      tileFilled: "border-primary/25 bg-gradient-to-br from-primary/[0.09] via-background/70 to-background/50",
      icon: "bg-primary/15 text-primary shadow-sm shadow-primary/10",
      iconMuted: "bg-primary/[0.07] text-primary/45",
      count: "text-primary",
      selectedRing: "border-primary/50 ring-2 ring-primary/20 shadow-md shadow-primary/10",
      hover: "hover:border-primary/40 hover:from-primary/[0.12]",
    },
    secondary: {
      tile: "border-border/50 bg-background/50",
      tileFilled:
        "border-secondary/30 bg-gradient-to-br from-secondary/15 via-background/70 to-background/50",
      icon: "bg-secondary/20 text-secondary-foreground shadow-sm shadow-secondary/10",
      iconMuted: "bg-secondary/10 text-secondary-foreground/45",
      count: "text-secondary-foreground",
      selectedRing: "border-secondary/50 ring-2 ring-secondary/25 shadow-md shadow-secondary/10",
      hover: "hover:border-secondary/40 hover:from-secondary/20",
    },
    success: {
      tile: "border-border/50 bg-background/50",
      tileFilled: "border-success/25 bg-gradient-to-br from-success/[0.09] via-background/70 to-background/50",
      icon: "bg-success/15 text-success shadow-sm shadow-success/10",
      iconMuted: "bg-success/[0.07] text-success/45",
      count: "text-success",
      selectedRing: "border-success/50 ring-2 ring-success/20 shadow-md shadow-success/10",
      hover: "hover:border-success/40 hover:from-success/[0.12]",
    },
    amber: {
      tile: "border-border/50 bg-background/50",
      tileFilled:
        "border-amber-500/25 bg-gradient-to-br from-amber-500/[0.09] via-background/70 to-background/50 dark:border-amber-400/25 dark:from-amber-400/[0.08]",
      icon: "bg-amber-500/15 text-amber-700 shadow-sm shadow-amber-500/10 dark:text-amber-400",
      iconMuted: "bg-amber-500/[0.07] text-amber-600/45 dark:text-amber-400/40",
      count: "text-amber-700 dark:text-amber-400",
      selectedRing:
        "border-amber-500/50 ring-2 ring-amber-500/20 shadow-md shadow-amber-500/10 dark:border-amber-400/50 dark:ring-amber-400/20",
      hover: "hover:border-amber-500/40 hover:from-amber-500/[0.12] dark:hover:border-amber-400/40",
    },
    violet: {
      tile: "border-border/50 bg-background/50",
      tileFilled:
        "border-violet-500/25 bg-gradient-to-br from-violet-500/[0.09] via-background/70 to-background/50 dark:border-violet-400/25 dark:from-violet-400/[0.08]",
      icon: "bg-violet-500/15 text-violet-700 shadow-sm shadow-violet-500/10 dark:text-violet-400",
      iconMuted: "bg-violet-500/[0.07] text-violet-600/45 dark:text-violet-400/40",
      count: "text-violet-700 dark:text-violet-400",
      selectedRing:
        "border-violet-500/50 ring-2 ring-violet-500/20 shadow-md shadow-violet-500/10 dark:border-violet-400/50 dark:ring-violet-400/20",
      hover: "hover:border-violet-500/40 hover:from-violet-500/[0.12] dark:hover:border-violet-400/40",
    },
  };

  const p = palettes[accent];
  return {
    tile: cn(filled ? p.tileFilled : p.tile, interactive && p.hover),
    icon: filled ? p.icon : p.iconMuted,
    count: filled ? p.count : "text-muted-foreground",
    selectedRing: p.selectedRing,
  };
}

function RoleStatTile({
  role,
  count,
  selected,
  onClick,
}: {
  role: RoleDef;
  count: number;
  selected: boolean;
  onClick?: () => void;
}) {
  const Icon = role.icon;
  const hasCount = count > 0;
  const style = roleAccentStyles(role.accent, hasCount, selected, Boolean(onClick));

  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors sm:size-8",
            style.icon,
          )}
          aria-hidden
        >
          <Icon className="size-3.5 sm:size-4" />
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        <span className="lg:hidden">{role.shortLabel}</span>
        <span className="hidden lg:inline">{role.fullLabel}</span>
      </p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums leading-none sm:text-2xl", style.count)}>
        {count}
      </p>
    </>
  );

  const tileClass = cn(
    "rounded-lg border px-2.5 py-2 transition-all duration-200 sm:px-3",
    style.tile,
    selected && style.selectedRing,
  );

  if (!onClick) {
    return (
      <div className={tileClass} title={role.fullLabel}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={`${role.fullLabel} — filter table`}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        tileClass,
        "w-full text-left",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        !selected && "hover:shadow-sm",
      )}
    >
      {body}
    </button>
  );
}

type Props = {
  roleCounts: FinanceCentreSchoolSummaryRoleCounts;
  subjectFilter: TimetableSubjectFilter;
  activeDesignation?: string;
  onRoleClick?: (designation: string) => void;
};

export function OfficialRolesPanel({
  roleCounts,
  subjectFilter,
  activeDesignation,
  onRoleClick,
}: Props) {
  const total = OFFICIAL_ROLE_DEFS.reduce((sum, role) => sum + roleCounts[role.key], 0);
  const hasOfficials = total > 0;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-36 flex-col gap-3 overflow-hidden rounded-xl border p-4 sm:p-5",
        "border-border bg-card bg-gradient-to-br from-primary/[0.04] via-card to-card",
        "shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/[0.06] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-6 left-1/3 size-20 rounded-full bg-success/[0.05] blur-2xl"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-gradient-to-br from-primary/12 to-primary/5 text-primary shadow-sm"
            aria-hidden
          >
            <UsersRound className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Other officials
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{subjectScopeLabel(subjectFilter)} scope</p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tabular-nums",
            hasOfficials
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border/60 bg-muted/50 text-muted-foreground",
          )}
        >
          {total}
        </span>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-2.5">
        {OFFICIAL_ROLE_DEFS.map((role) => (
          <RoleStatTile
            key={role.key}
            role={role}
            count={roleCounts[role.key]}
            selected={activeDesignation === role.fullLabel}
            onClick={onRoleClick ? () => onRoleClick(role.fullLabel) : undefined}
          />
        ))}
      </div>

      <p className="relative mt-auto text-[10px] leading-relaxed text-muted-foreground">
        {total === 0 ? (
          "No officials in these roles for this scope."
        ) : (
          <>
            <span className="font-medium text-foreground">{total}</span>
            {" official"}
            {total === 1 ? "" : "s"}
            {" in scope"}
          </>
        )}
        {onRoleClick ? (
          <span className="text-primary/80"> · Click a role to filter the table below</span>
        ) : null}
      </p>
    </div>
  );
}
