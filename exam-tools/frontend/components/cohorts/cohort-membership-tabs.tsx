"use client";

import { RegionRulePicker } from "@/components/cohorts/region-rule-picker";
import { RoleRulePicker } from "@/components/cohorts/role-rule-picker";
import { IndividualMemberPicker } from "@/components/cohorts/individual-member-picker";
import type { ClaimedRule, MembershipExaminer, MembershipTab, RuleOption } from "@/components/cohorts/types";
import { cn } from "@/lib/utils";

type Props = {
  activeTab: MembershipTab;
  onTabChange: (tab: MembershipTab) => void;
  showRolesTab: boolean;
  regionOptions: RuleOption[];
  roleOptions: RuleOption[];
  regionsDraft: Record<string, boolean>;
  rolesDraft: Record<string, boolean>;
  membersDraft: Record<string, boolean>;
  claimedRegions: Map<string, ClaimedRule>;
  claimedRoles: Map<string, ClaimedRule>;
  examiners: MembershipExaminer[];
  unassignedIds: Set<string>;
  peopleFilterUnassignedOnly: boolean;
  onPeopleFilterUnassignedOnlyChange: (v: boolean) => void;
  disabled?: boolean;
  onToggleRegion: (region: string, checked: boolean) => void;
  onToggleRole: (role: string, checked: boolean) => void;
  onToggleExaminer: (examinerId: string, checked: boolean) => void;
  peopleOverrideWarning?: string;
};

const TAB_LABELS: { key: MembershipTab; label: string }[] = [
  { key: "regions", label: "Regions" },
  { key: "roles", label: "Roles" },
  { key: "people", label: "People" },
];

export function CohortMembershipTabs({
  activeTab,
  onTabChange,
  showRolesTab,
  regionOptions,
  roleOptions,
  regionsDraft,
  rolesDraft,
  membersDraft,
  claimedRegions,
  claimedRoles,
  examiners,
  unassignedIds,
  peopleFilterUnassignedOnly,
  onPeopleFilterUnassignedOnlyChange,
  disabled = false,
  onToggleRegion,
  onToggleRole,
  onToggleExaminer,
  peopleOverrideWarning,
}: Props) {
  const tabs = TAB_LABELS.filter((t) => t.key !== "roles" || showRolesTab);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="inline-flex shrink-0 rounded-lg border border-border bg-muted/30 p-0.5"
        role="tablist"
        aria-label="Membership rules"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden" role="tabpanel">
        {activeTab === "regions" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <p className="mb-3 shrink-0 text-xs text-muted-foreground">
              Select regions to add all examiners in that home region.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
            <RegionRulePicker
              options={regionOptions}
              regionsDraft={regionsDraft}
              claimedRegions={claimedRegions}
              disabled={disabled}
              onToggle={onToggleRegion}
            />
            </div>
          </div>
        ) : null}

        {activeTab === "roles" && showRolesTab ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <p className="mb-3 shrink-0 text-xs text-muted-foreground">
              Select roles to add all examiners with that role on this subject.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
            <RoleRulePicker
              options={roleOptions}
              rolesDraft={rolesDraft}
              claimedRoles={claimedRoles}
              disabled={disabled}
              onToggle={onToggleRole}
            />
            </div>
          </div>
        ) : null}

        {activeTab === "people" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-3 shrink-0 text-xs text-muted-foreground">
              Pick individual examiners for exceptions or fine-grained control.
            </p>
            <div className="min-h-0 flex-1">
              <IndividualMemberPicker
                examiners={examiners}
                membersDraft={membersDraft}
                regionsDraft={regionsDraft}
                rolesDraft={rolesDraft}
                unassignedOnly={peopleFilterUnassignedOnly}
                onUnassignedOnlyChange={onPeopleFilterUnassignedOnlyChange}
                unassignedIds={unassignedIds}
                disabled={disabled}
                onToggle={onToggleExaminer}
                regionsOverrideWarning={peopleOverrideWarning}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
