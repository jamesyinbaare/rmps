"use client";

import { useCallback, useRef, type MutableRefObject, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type OfficialAccountsRoleTab<K extends string> = {
  key: K;
  label: string;
};

type OfficialAccountsRoleTabsProps<K extends string> = {
  tabs: OfficialAccountsRoleTab<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  sticky?: boolean;
  /** Primary = full-width segmented nav (page-level). Default = compact underline tabs. */
  variant?: "primary" | "compact";
  /** Render as top edge of the main card (no extra gap below tabs). */
  integratedPanel?: boolean;
  /** Optional content shown to the left of the tab list (compact variant only). */
  leadingContent?: ReactNode;
};

export function OfficialAccountsRoleTabs<K extends string>({
  tabs,
  activeKey,
  onChange,
  ariaLabel = "Role group",
  sticky = false,
  variant = "primary",
  integratedPanel = false,
  leadingContent,
}: OfficialAccountsRoleTabsProps<K>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (!tab) return;
      tabRefs.current[index]?.focus();
      onChange(tab.key);
    },
    [tabs, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.key === activeKey);
      if (currentIndex < 0) return;

      let nextIndex = currentIndex;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      focusTab(nextIndex);
    },
    [tabs, activeKey, focusTab],
  );

  if (tabs.length === 0) return null;

  const stickyClass = sticky
    ? "sticky top-[var(--staff-sticky-header-offset,4.5rem)] z-10 -mx-1 shrink-0 bg-background/95 px-1 pb-2 backdrop-blur supports-backdrop-filter:bg-background/90 sm:mx-0 sm:px-0"
    : "shrink-0 pb-2";

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "shrink-0 border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10",
          integratedPanel ? "rounded-t-2xl" : sticky && stickyClass,
          !integratedPanel && !sticky && "pb-0",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2.5",
            leadingContent && "sm:justify-between",
          )}
        >
          {leadingContent ? <div className="min-w-0 shrink-0">{leadingContent}</div> : null}
          <div
            className="min-w-0 flex-1"
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
          >
            <div className="flex gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-border/60 bg-muted/25 p-1 shadow-inner">
              {tabs.map((tab, index) => (
                <CompactTabButton
                  key={tab.key}
                  tab={tab}
                  index={index}
                  isActive={activeKey === tab.key}
                  tabRefs={tabRefs}
                  onSelect={() => onChange(tab.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <nav className={cn(stickyClass)} aria-label={ariaLabel}>
      <div
        role="tablist"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, index) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              id={`admin-eo-tab-${tab.key}`}
              aria-controls={`admin-eo-panel-${tab.key}`}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-12 sm:px-4",
                isActive
                  ? "border-success/50 bg-card text-foreground shadow-md ring-1 ring-success/20"
                  : "border-border/80 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
              )}
              onClick={() => onChange(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CompactTabButton<K extends string>({
  tab,
  index,
  isActive,
  tabRefs,
  onSelect,
}: {
  tab: OfficialAccountsRoleTab<K>;
  index: number;
  isActive: boolean;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  onSelect: () => void;
}) {
  return (
    <button
      ref={(el) => {
        tabRefs.current[index] = el;
      }}
      type="button"
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      id={`admin-eo-tab-${tab.key}`}
      aria-controls={`admin-eo-panel-${tab.key}`}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-3.5",
        isActive
          ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-success/25"
          : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      onClick={onSelect}
    >
      {tab.label}
    </button>
  );
}
