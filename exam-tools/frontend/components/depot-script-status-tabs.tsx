"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DepotScriptStatusTab<K extends string> = {
  key: K;
  title: string;
  subjectCount: number;
  paperCount: number;
  /** Primary number shown on the tab (e.g. envelopes left to verify). */
  metricValue: number;
  metricLabel: string;
};

type DepotScriptStatusTabsProps<K extends string> = {
  tabs: DepotScriptStatusTab<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  statusToneClass: Record<K, string>;
  desktopColumns?: 2 | 3;
};

const statusIcon: Record<string, LucideIcon> = {
  unverified: ClipboardList,
  notRecorded: AlertCircle,
  verified: CheckCircle2,
};

function countSubtitle(subjectCount: number, paperCount: number): string {
  return `${subjectCount} subj · ${paperCount} pap`;
}

function TabButton<K extends string>({
  tab,
  isActive,
  toneClass,
  onSelect,
  layout,
}: {
  tab: DepotScriptStatusTab<K>;
  isActive: boolean;
  toneClass: string;
  onSelect: () => void;
  layout: "mobile" | "desktop";
}) {
  const Icon = statusIcon[tab.key] ?? ClipboardList;

  if (layout === "mobile") {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        className={`flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
          isActive
            ? `${toneClass} shadow-sm ring-1 ring-inset ring-current/20`
            : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
        }`}
        onClick={onSelect}
      >
        <Icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-90" : "opacity-60"}`} aria-hidden />
        <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{tab.title}</span>
        <span className={`tabular-nums text-xl font-bold leading-none ${isActive ? "" : "text-foreground/80"}`}>
          {tab.metricValue}
        </span>
        <span className="text-[10px] leading-tight opacity-75">{tab.metricLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
        isActive ? toneClass : "border-transparent bg-transparent hover:bg-muted/80"
      }`}
      onClick={onSelect}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isActive ? "bg-background/50" : "bg-muted"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{tab.title}</span>
        <span className="mt-0.5 block text-xs opacity-80">
          <span className="font-semibold tabular-nums">{tab.metricValue}</span> {tab.metricLabel}
          <span className="opacity-60"> · {countSubtitle(tab.subjectCount, tab.paperCount)}</span>
        </span>
      </span>
    </button>
  );
}

export function DepotScriptStatusTabs<K extends string>({
  tabs,
  activeKey,
  onChange,
  statusToneClass,
  desktopColumns = 3,
}: DepotScriptStatusTabsProps<K>) {
  const mobileCols = desktopColumns === 2 ? "grid-cols-2" : "grid-cols-3";
  const desktopGridClass = desktopColumns === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  if (tabs.length === 0) return null;

  return (
    <div className="sticky top-[var(--staff-sticky-header-offset,4.5rem)] z-20 -mx-1 px-1 pb-1 sm:mx-0 sm:px-0">
      <div className="rounded-2xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/90">
        {/* Mobile: equal segments, all visible */}
        <div
          className={`grid gap-1 md:hidden ${mobileCols}`}
          role="tablist"
          aria-label="Verification status"
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={activeKey === tab.key}
              toneClass={statusToneClass[tab.key]}
              onSelect={() => onChange(tab.key)}
              layout="mobile"
            />
          ))}
        </div>

        {/* Desktop */}
        <div
          className={`hidden gap-1 md:grid ${desktopGridClass}`}
          role="tablist"
          aria-label="Verification status"
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={activeKey === tab.key}
              toneClass={statusToneClass[tab.key]}
              onSelect={() => onChange(tab.key)}
              layout="desktop"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Shared header for the active status panel below the tabs. */
export function DepotScriptStatusPanelHeader({
  title,
  description,
  toneClass,
  stats,
}: {
  title: string;
  description: string;
  toneClass: string;
  stats: ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <h2 className="text-base font-semibold leading-snug sm:text-lg">{title}</h2>
      <p className="mt-1 text-sm opacity-90">{description}</p>
      {stats ? <div className="mt-3 text-xs opacity-90">{stats}</div> : null}
    </div>
  );
}
