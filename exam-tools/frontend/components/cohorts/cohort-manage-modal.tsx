"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CohortDiscardConfirm } from "@/components/cohorts/cohort-discard-confirm";
import { CohortMembershipPreview } from "@/components/cohorts/cohort-membership-preview";
import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { CohortWorkspace } from "@/components/cohorts/cohort-workspace";
import { CohortWorkspaceFooter } from "@/components/cohorts/cohort-workspace-footer";

import type { ClaimedRule, MembershipExaminer, MembershipTab, RuleOption } from "@/components/cohorts/types";

export type CohortDetailsSectionContext = {
  locked: boolean;
  busy: boolean;
};

type CohortManageModalProps = {
  open: boolean;
  mode: "create" | "edit";
  entityLabel?: string;
  description?: string;
  name: string;
  onNameChange: (v: string) => void;
  detailsSection?: ReactNode | ((ctx: CohortDetailsSectionContext) => ReactNode);
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
  selectedCount: number;
  busy?: boolean;
  detailsError?: string | null;
  membershipError?: string | null;
  softWarning?: string | null;
  scheduleWarnings?: string[];
  detailsDirty?: boolean;
  membershipDirty?: boolean;
  detailsSaveDisabled?: boolean;
  canSaveMembership?: boolean;
  isDirty?: boolean;
  deleteConfirmOpen?: boolean;
  onDeleteConfirmOpenChange?: (open: boolean) => void;
  onToggleRegion: (region: string, checked: boolean) => void;
  onToggleRole: (role: string, checked: boolean) => void;
  onToggleExaminer: (examinerId: string, checked: boolean) => void;
  onSaveDetails: () => boolean | Promise<boolean>;
  onCancelDetailsEdit: () => void;
  onSaveMembership: () => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  peopleOverrideWarning?: string;
  loading?: boolean;
  membershipLocked?: boolean;
  nameDisabled?: boolean;
  /** When false, details stay locked with no edit/save controls. */
  detailsEditable?: boolean;
};

export function CohortManageModal({
  open,
  mode,
  entityLabel = "cohort",
  description,
  name,
  onClose,
  selectedCount,
  busy = false,
  detailsError = null,
  membershipError = null,
  softWarning = null,
  scheduleWarnings = [],
  detailsDirty = false,
  membershipDirty = false,
  detailsSaveDisabled = false,
  canSaveMembership = true,
  isDirty = false,
  deleteConfirmOpen = false,
  onDeleteConfirmOpenChange,
  onSaveDetails,
  onCancelDetailsEdit,
  onSaveMembership,
  onDelete,
  membersDraft,
  regionsDraft,
  rolesDraft,
  examiners,
  detailsSection,
  detailsEditable = true,
  ...workspaceProps
}: CohortManageModalProps) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);

  useEffect(() => {
    if (!open) {
      setDiscardOpen(false);
      setDetailsEditing(false);
      return;
    }
    setDetailsEditing(false);
  }, [open, mode]);

  const detailsLocked = !detailsEditing || !detailsEditable;

  const resolvedDetailsSection =
    typeof detailsSection === "function"
      ? detailsSection({ locked: detailsLocked, busy })
      : detailsSection;

  function unlockDetails() {
    setDetailsEditing(true);
    requestAnimationFrame(() => {
      document.getElementById("cohort-ws-name")?.focus();
    });
  }

  async function handleSaveDetails() {
    const ok = await onSaveDetails();
    if (ok) setDetailsEditing(false);
  }

  function handleCancelDetailsEdit() {
    onCancelDetailsEdit();
    setDetailsEditing(false);
  }

  const title =
    mode === "create" ? `Create ${entityLabel}` : name.trim() || `Edit ${entityLabel}`;

  const modalDescription =
    description ??
    (mode === "create"
      ? `Save details to create the ${entityLabel}, then save membership separately.`
      : `Edit and save details and membership independently.`);

  const closeBlocked = busy || deleteConfirmOpen;

  function handleCloseAttempt() {
    if (closeBlocked) return;
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      setDiscardOpen(false);
      onClose();
    }
  }

  function confirmDiscard() {
    setDiscardOpen(false);
    onClose();
  }

  return (
    <CohortModalShell
      open={open}
      onClose={onClose}
      onCloseAttempt={handleCloseAttempt}
      title={title}
      description={modalDescription}
      closeDisabled={closeBlocked}
      footer={
        <div className="flex min-h-0 flex-col">
          {discardOpen ? (
            <CohortDiscardConfirm
              entityLabel={entityLabel}
              onCancel={() => setDiscardOpen(false)}
              onConfirm={confirmDiscard}
            />
          ) : null}
          <CohortMembershipPreview
            examiners={examiners}
            membersDraft={membersDraft}
            regionsDraft={regionsDraft}
            rolesDraft={rolesDraft}
            className="mb-3 min-h-0"
          />
          <CohortWorkspaceFooter
            mode={mode}
            entityLabel={entityLabel}
            selectedCount={selectedCount}
            busy={busy}
            error={membershipError}
            softWarning={softWarning}
            membershipDirty={membershipDirty}
            canSaveMembership={canSaveMembership}
            deleteConfirmOpen={deleteConfirmOpen}
            onDeleteConfirmOpenChange={onDeleteConfirmOpenChange}
            onSaveMembership={() => void onSaveMembership()}
            onDelete={onDelete}
          />
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <CohortWorkspace
          {...workspaceProps}
          entityLabel={entityLabel}
          name={name}
          busy={busy}
          detailsSection={resolvedDetailsSection}
          detailsLocked={detailsLocked}
          detailsDirty={detailsDirty}
          detailsSaveDisabled={detailsSaveDisabled}
          detailsError={detailsError}
          scheduleWarnings={scheduleWarnings}
          onUnlockDetails={detailsEditable ? unlockDetails : undefined}
          onSaveDetails={detailsEditable ? () => void handleSaveDetails() : undefined}
          onCancelDetailsEdit={detailsEditable ? handleCancelDetailsEdit : undefined}
          membersDraft={membersDraft}
          regionsDraft={regionsDraft}
          rolesDraft={rolesDraft}
          examiners={examiners}
        />
      </div>
    </CohortModalShell>
  );
}
