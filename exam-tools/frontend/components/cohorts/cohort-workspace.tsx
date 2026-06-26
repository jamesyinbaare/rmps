"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CalendarDays, Pencil, Users } from "lucide-react";

import { CohortCollapsibleSection } from "@/components/cohorts/cohort-collapsible-section";
import { CohortMembershipTabs } from "@/components/cohorts/cohort-membership-tabs";
import {
  CohortSectionTabs,
  type CohortSectionTabOption,
} from "@/components/cohorts/cohort-section-tabs";
import { cohortScheduleSummaryParts } from "@/components/cohorts/cohort-schedule-fields";
import type { ClaimedRule, MembershipExaminer, MembershipTab, RuleOption } from "@/components/cohorts/types";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

export type CohortWorkspaceLayoutVariant = "standard" | "admin";

type AdminSectionTab = "schedule" | "membership";

const ADMIN_SECTION_TABS: [
  CohortSectionTabOption<AdminSectionTab>,
  CohortSectionTabOption<AdminSectionTab>,
] = [
  { value: "schedule", label: "Schedule" },
  { value: "membership", label: "Membership" },
];

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
  scheduleSummary?: {
    coordinationStartDate?: string | null;
    coordinationStartTime?: string | null;
    coordinationEndDate?: string | null;
    coordinationEndTime?: string | null;
    markingStartDate?: string | null;
    markingEndDate?: string | null;
    markedScriptSubmissionDeadline?: string | null;
  };
  onUnlockDetails?: () => void;
  onSaveDetails?: () => void;
  onCancelDetailsEdit?: () => void;
  detailsExpanded?: boolean;
  onDetailsExpandedChange?: (open: boolean) => void;
  layoutVariant?: CohortWorkspaceLayoutVariant;
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
  scheduleSummary,
  onUnlockDetails,
  onSaveDetails,
  onCancelDetailsEdit,
  detailsExpanded,
  onDetailsExpandedChange,
  layoutVariant = "standard",
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
  const isWideViewport = useMediaQuery("(min-width: 1280px)");
  const [internalDetailsOpen, setInternalDetailsOpen] = useState(true);
  const [adminSectionTab, setAdminSectionTab] = useState<AdminSectionTab>("schedule");
  const detailsOpen = detailsExpanded ?? internalDetailsOpen;
  const isAdminLayout = layoutVariant === "admin";
  const useAdminTabs = isAdminLayout && !isWideViewport;

  function setDetailsOpen(next: boolean) {
    if (detailsExpanded === undefined) setInternalDetailsOpen(next);
    onDetailsExpandedChange?.(next);
  }

  useEffect(() => {
    if (!detailsLocked) setDetailsOpen(true);
  }, [detailsLocked]);

  useEffect(() => {
    if (useAdminTabs) setAdminSectionTab("schedule");
  }, [useAdminTabs]);

  const collapsedSummary = scheduleSummary
    ? cohortScheduleSummaryParts(scheduleSummary).join(" · ") || undefined
    : undefined;

  const editActionLabel = isAdminLayout ? "Edit schedule" : "Edit details";
  const saveActionLabel = isAdminLayout ? "Save schedule" : "Save details";

  const detailsActions = (
    <>
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
          {editActionLabel}
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
          {saveActionLabel}
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
    </>
  );

  if (loading) {
    return (
      <div className="grid h-full min-h-80 gap-6 lg:grid-cols-[minmax(11rem,1fr)_minmax(0,3.5fr)]">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
        </div>
        <div className="min-h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  const nameField = (
    <div className="min-w-0">
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
        autoFocus={!detailsLocked && !isAdminLayout}
      />
    </div>
  );

  const scheduleBody = (
    <div className="space-y-4">
      {scheduleWarnings.map((w) => (
        <p key={w} className="text-sm text-amber-800 dark:text-amber-300">
          {w}
        </p>
      ))}
      {detailsSection}
    </div>
  );

  const membershipPanel = (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/15 p-4 sm:p-5",
        isAdminLayout ? "flex-1 xl:min-h-0" : "max-lg:min-h-48 lg:min-h-0 flex-1",
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/60 text-primary">
          <Users className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Membership</h3>
      </div>
      <p className="mt-1 shrink-0 text-xs text-muted-foreground">
        {membershipLocked
          ? isAdminLayout
            ? "All subject examiners stay in the default cohort. Edit the schedule on the left."
            : "All subject examiners are always in the default cohort. Edit the schedule above; membership is managed automatically."
          : isAdminLayout
            ? "Assign examiners by region, role, or manual selection. Both region and role rules require a match on both."
            : "Use region rules, role rules, or both to auto-assign examiners as they join this subject. When both are set, an examiner must match a selected region and role. The same region or role may be used in multiple cohorts. Free-form cohorts use manual picks on the People tab only."}
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
  );

  if (isAdminLayout) {
    const scheduleHeader = (
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/60 text-primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!detailsLocked && detailsDirty ? (
            <span className="self-center text-xs font-normal text-amber-800 dark:text-amber-300">
              Unsaved
            </span>
          ) : null}
          {detailsActions}
        </div>
      </div>
    );

    const scheduleSection = useAdminTabs ? (
      <div className="space-y-3">
        {scheduleHeader}
        {scheduleBody}
      </div>
    ) : (
      <section className="shrink-0 space-y-3">
        {scheduleHeader}
        {scheduleBody}
      </section>
    );

    const scheduleColumn = (
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        {detailsError ? <p className="shrink-0 text-sm text-destructive">{detailsError}</p> : null}
        {nameField}
        {scheduleSection}
      </div>
    );

    if (useAdminTabs) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
          {detailsError ? <p className="shrink-0 text-sm text-destructive">{detailsError}</p> : null}
          {nameField}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!detailsLocked && detailsDirty ? (
              <span className="text-xs font-normal text-amber-800 dark:text-amber-300">
                Unsaved schedule
              </span>
            ) : null}
            {detailsActions}
          </div>
          <CohortSectionTabs
            activeTab={adminSectionTab}
            onChange={setAdminSectionTab}
            tabs={ADMIN_SECTION_TABS}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {adminSectionTab === "schedule" ? scheduleSection : membershipPanel}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col gap-4 overflow-hidden xl:grid xl:h-full xl:min-h-0 xl:gap-6",
          "xl:grid-cols-[minmax(11rem,1fr)_minmax(0,3.5fr)] xl:grid-rows-1",
        )}
      >
        {scheduleColumn}
        {membershipPanel}
      </div>
    );
  }

  const detailsBody = (
    <div className="space-y-4">
      {detailsError ? <p className="text-sm text-destructive">{detailsError}</p> : null}
      {scheduleWarnings.map((w) => (
        <p key={w} className="text-sm text-amber-800 dark:text-amber-300">
          {w}
        </p>
      ))}
      {nameField}
      {detailsSection}
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-6 overflow-hidden lg:grid lg:h-full lg:min-h-0 lg:gap-8",
        detailsOpen ? "lg:grid-cols-[minmax(11rem,1fr)_minmax(0,3.5fr)] lg:grid-rows-1" : "lg:grid-cols-1",
      )}
    >
      <div className="flex min-h-0 flex-col overflow-y-auto pr-1 lg:max-h-full">
        <CohortCollapsibleSection
          title="Details"
          icon={CalendarDays}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          className={detailsOpen ? "min-h-0 flex-1" : undefined}
          collapsedSummary={
            collapsedSummary ?? (name.trim() ? name.trim() : undefined)
          }
          headerActions={
            <>
              {!detailsLocked && detailsDirty ? (
                <span className="self-center text-xs font-normal text-amber-800 dark:text-amber-300">
                  Unsaved
                </span>
              ) : null}
              {detailsActions}
            </>
          }
        >
          {detailsBody}
        </CohortCollapsibleSection>
      </div>

      {membershipPanel}
    </div>
  );
}
