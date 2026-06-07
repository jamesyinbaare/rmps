"use client";

import { cn } from "@/lib/utils";

import type { ExaminerInvitationTab } from "@/components/examiner-invitation/types";

type Props = {
  activeTab: ExaminerInvitationTab;
  onTabChange: (tab: ExaminerInvitationTab) => void;
  showProfile: boolean;
};

export function ExaminerInvitationTabs({ activeTab, onTabChange, showProfile }: Props) {
  if (!showProfile) return null;

  return (
    <div
      className="mb-5 flex rounded-2xl border border-border/70 bg-muted/30 p-1"
      role="tablist"
      aria-label="Examiner portal sections"
    >
      {(
        [
          { id: "landing" as const, label: "Landing" },
          { id: "profile" as const, label: "Profile" },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={cn(
            "min-h-11 flex-1 rounded-xl px-3 text-sm font-medium transition-colors",
            activeTab === tab.id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
