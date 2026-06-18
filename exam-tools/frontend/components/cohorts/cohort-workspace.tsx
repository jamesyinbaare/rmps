"use client";

import type { ReactNode } from "react";

import { Pencil } from "lucide-react";

import { CohortMembershipTabs } from "@/components/cohorts/cohort-membership-tabs";
import type { ClaimedRule, MembershipExaminer, MembershipTab, RuleOption } from "@/components/cohorts/types";
import { Button } from "@/components/ui/button";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  entityLabel?: string;
  name: string;
  onNameChange: (v: string) => void;
  detailsSection?: ReactNode;
  detailsLocked?: boolean;
  detailsDirty?: boolean;
  detailsSaveDisabled?: boolean;
  detailsError?: string | null;
  scheduleWarnings?: string[];
  onUnlockDetails?: () => void;
  onSaveDetails?: () => void;
  onCancelDetailsEdit?: () => void;
  showRolesTab: boolean;
  activeTab: MembershipTab;
  onTabChange: (tab: MembershipTab) => void;
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
  busy?: boolean;
  onToggleRegion: (region: string, checked: boolean) => void;
  onToggleRole: (role: string, checked: boolean) => void;
  onToggleExaminer: (examinerId: string, checked: boolean) => void;
  peopleOverrideWarning?: string;
  loading?: boolean;
  membershipLocked?: boolean;
  nameDisabled?: boolean;
};

export function CohortWorkspace({
  entityLabel = "cohort",
  name,
  onNameChange,
  detailsSection,
  detailsLocked = false,
  detailsDirty = false,
  detailsSaveDisabled = false,
  detailsError = null,
  scheduleWarnings = [],
  onUnlockDetails,
  onSaveDetails,
  onCancelDetailsEdit,
  showRolesTab,
  activeTab,
  onTabChange,
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
  busy = false,
  onToggleRegion,
  onToggleRole,
  onToggleExaminer,
  peopleOverrideWarning,
  loading = false,
  membershipLocked = false,
  nameDisabled = false,
}: Props) {
  if (loading) {
    return (
      <div className="grid h-full min-h-80 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
        </div>
        <div className="min-h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-rows-1 lg:gap-8">
      <div className="min-h-0 overflow-hidden pr-1 max-lg:max-h-[38%] max-lg:overflow-y-auto lg:min-h-0">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Details
              {!detailsLocked && detailsDirty ? (
                <span className="ml-1.5 text-xs font-normal text-amber-800 dark:text-amber-300">
                  · unsaved
                </span>
              ) : null}
            </h3>
            <div className="flex shrink-0 flex-wrap gap-2">
              {detailsLocked && onUnlockDetails ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy}
                  onClick={onUnlockDetails}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit details
                </Button>
              ) : null}
              {!detailsLocked && onSaveDetails ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={busy || detailsSaveDisabled || !detailsDirty || !name.trim()}
                  onClick={onSaveDetails}
                >
                  Save details
                </Button>
              ) : null}
              {!detailsLocked && onCancelDetailsEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy}
                  onClick={onCancelDetailsEdit}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
          {detailsError ? <p className="text-sm text-destructive">{detailsError}</p> : null}
          {scheduleWarnings.map((w) => (
            <p key={w} className="text-sm text-amber-800 dark:text-amber-300">
              {w}
            </p>
          ))}
          <div>
            <label className={formLabelClass} htmlFor="cohort-ws-name">
              Name
            </label>
            <input
              id="cohort-ws-name"
              className={cn(
                formInputClass,
                "mt-1",
                detailsLocked && "cursor-not-allowed opacity-70",
              )}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`e.g. Northern ${entityLabel}`}
              disabled={busy || detailsLocked || nameDisabled}
              autoFocus={!detailsLocked}
            />
          </div>
          {detailsSection}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted/15 p-4 max-lg:min-h-48 sm:p-5 lg:min-h-0">
        <h3 className="shrink-0 text-sm font-semibold text-foreground">Membership</h3>
        <p className="mt-1 shrink-0 text-xs text-muted-foreground">
          {membershipLocked
            ? "All subject examiners are always in the default cohort. Edit the schedule above; membership is managed automatically."
            : "Use region or role rules for bulk assignment, or pick individuals on the People tab."}
        </p>
        <div className="mt-3 min-h-0 flex-1">
          <CohortMembershipTabs
            activeTab={activeTab}
            onTabChange={onTabChange}
            showRolesTab={showRolesTab}
            regionOptions={regionOptions}
            roleOptions={roleOptions}
            regionsDraft={regionsDraft}
            rolesDraft={rolesDraft}
            membersDraft={membersDraft}
            claimedRegions={claimedRegions}
            claimedRoles={claimedRoles}
            examiners={examiners}
            unassignedIds={unassignedIds}
            peopleFilterUnassignedOnly={peopleFilterUnassignedOnly}
            onPeopleFilterUnassignedOnlyChange={onPeopleFilterUnassignedOnlyChange}
            disabled={busy || membershipLocked}
            onToggleRegion={onToggleRegion}
            onToggleRole={onToggleRole}
            onToggleExaminer={onToggleExaminer}
            peopleOverrideWarning={peopleOverrideWarning}
          />
        </div>
      </div>
    </div>
  );
}
