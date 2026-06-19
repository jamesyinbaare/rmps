"use client";

import { LayoutGrid, UserCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ExaminerInvitationTab } from "@/components/examiner-invitation/types";

type Props = {
  activeTab: ExaminerInvitationTab;
  onTabChange: (tab: ExaminerInvitationTab) => void;
  showProfile: boolean;
};

const TABS = [
  { id: "landing" as const, label: "Overview", icon: LayoutGrid },
  { id: "profile" as const, label: "Profile", icon: UserCircle },
] as const;

export function ExaminerInvitationTabs({ activeTab, onTabChange, showProfile }: Props) {
  if (!showProfile) return null;

  return (
    <div
      className="mb-5 flex rounded-2xl border border-border/70 bg-muted/30 p-1"
      role="tablist"
      aria-label="Examiner portal sections"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
