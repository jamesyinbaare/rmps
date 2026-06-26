"use client";

import { cn } from "@/lib/utils";

export type CohortSectionTabOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  activeTab: T;
  onChange: (tab: T) => void;
  tabs: [CohortSectionTabOption<T>, CohortSectionTabOption<T>];
  /** Negative margin for bottom sheet; flush for modal body */
  inset?: "sheet" | "none";
  className?: string;
};

export function CohortSectionTabs<T extends string>({
  activeTab,
  onChange,
  tabs,
  inset = "none",
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 border-b border-border/80 bg-background/95 py-2.5 backdrop-blur-sm",
        inset === "sheet" ? "-mx-4 px-4" : "px-0",
        className,
      )}
      role="tablist"
      aria-label="Cohort sections"
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/80 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={cn(
              "min-h-10 rounded-md px-3 text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
