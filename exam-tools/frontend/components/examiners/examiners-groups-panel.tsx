"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildCohortFormSnapshot,
  cohortDetailsEqual,
  cohortMembershipEqual,
  type CohortFormSnapshot,
} from "@/components/cohorts/cohort-form-snapshot";
import { emptyCohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import { CohortCoverageBar } from "@/components/cohorts/cohort-coverage-bar";
import { CohortListColumn } from "@/components/cohorts/cohort-list-column";
import { CohortManageModal } from "@/components/cohorts/cohort-manage-modal";
import { CohortUnassignedModal } from "@/components/cohorts/cohort-unassigned-modal";
import type { CohortListItem, MembershipExaminer } from "@/components/cohorts/types";
import { computeCoverage } from "@/components/cohorts/utils";
import { useCohortMembershipDraft } from "@/components/cohorts/use-cohort-membership-draft";
import { EXAMINERS_PANEL_CLASS } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import {
  createExaminerGroup,
  deleteExaminerGroup,
  listExaminationExaminers,
  listExaminerGroups,
  replaceExaminerGroupMembers,
  replaceExaminerGroupSourceRegions,
  updateExaminerGroup,
  type ExaminerGroupRow,
  type ExaminerRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function toCohortListItem(g: ExaminerGroupRow): CohortListItem {
  return {
    id: g.id,
    name: g.name,
    examiner_ids: g.examiner_ids,
    source_regions: g.source_regions,
  };
}

function snapshotFromGroup(group: ExaminerGroupRow): CohortFormSnapshot {
  return buildCohortFormSnapshot(group.name, emptyCohortScheduleDraft(), {
    source_regions: group.source_regions,
    source_roles: [],
    examiner_ids: group.examiner_ids,
  });
}

type Props = {
  examId: number | null;
  embedded?: boolean;
  pageScroll?: boolean;
};

export function ExaminersGroupsPanel({ examId, embedded = false, pageScroll = false }: Props) {
  const [examiners, setExaminers] = useState<ExaminerRow[]>([]);
  const [groups, setGroups] = useState<ExaminerGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [unassignedModalOpen, setUnassignedModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<CohortFormSnapshot | null>(null);
  const pendingPreselectedRef = useRef<string[]>([]);
  const [captureCreateBaseline, setCaptureCreateBaseline] = useState(false);

  function membershipPayloadFromDrafts() {
    return {
      source_regions: Object.entries(membership.regionsDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      source_roles: Object.entries(membership.rolesDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      examiner_ids: Object.entries(membership.membersDraft)
        .filter(([, v]) => v)
        .map(([id]) => id),
    };
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedId(null);
    setIsCreating(false);
    setDeleteConfirmOpen(false);
    pendingPreselectedRef.current = [];
    setSavedSnapshot(null);
    setDetailsError(null);
    setMembershipError(null);
  }

  const cohortList = useMemo(() => groups.map(toCohortListItem), [groups]);

  const rosterExaminers = useMemo((): MembershipExaminer[] => {
    return examiners.map((e) => ({
      id: e.id,
      name: e.name,
      region: e.region,
      examiner_type: e.examiner_type,
    }));
  }, [examiners]);

  const editingCohortId = isCreating ? null : selectedId;
  const membership = useCohortMembershipDraft(rosterExaminers, cohortList, editingCohortId, {
    exclusiveRules: true,
  });

  const coverage = useMemo(
    () => computeCoverage(rosterExaminers, cohortList),
    [cohortList, rosterExaminers],
  );

  const emptySchedule = emptyCohortScheduleDraft();

  const detailsDirty =
    savedSnapshot != null &&
    !cohortDetailsEqual(
      { name: nameInput, schedule: emptySchedule },
      { name: savedSnapshot.name, schedule: savedSnapshot.schedule },
    );

  const membershipDirty =
    savedSnapshot != null &&
    !cohortMembershipEqual(membershipPayloadFromDrafts(), savedSnapshot.membership);

  const isDirty = detailsDirty || membershipDirty;
  const canSaveMembership = !isCreating || selectedId != null;

  const loadData = useCallback(async (eid: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, loadedGroups] = await Promise.all([
        listExaminationExaminers(eid),
        listExaminerGroups(eid),
      ]);
      setExaminers(list);
      setGroups(loadedGroups);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load groups");
      setExaminers([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (examId == null) {
      setExaminers([]);
      setGroups([]);
      closeModal();
      setUnassignedModalOpen(false);
      return;
    }
    void loadData(examId);
  }, [examId, loadData]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedId) ?? null,
    [groups, selectedId],
  );

  useEffect(() => {
    if (!modalOpen) return;
    if (isCreating) {
      setNameInput("");
      const pending = pendingPreselectedRef.current;
      pendingPreselectedRef.current = [];
      if (pending.length > 0) {
        membership.initWithExaminerIds(pending);
      } else {
        membership.resetEmpty();
      }
      setDeleteConfirmOpen(false);
      setCaptureCreateBaseline(true);
      return;
    }
    if (!selectedGroup) return;
    setNameInput(selectedGroup.name);
    membership.initFromCohort({
      examiner_ids: selectedGroup.examiner_ids,
      source_regions: selectedGroup.source_regions,
    });
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init when modal opens / selection changes
  }, [modalOpen, isCreating, selectedGroup?.id]);

  useEffect(() => {
    if (!modalOpen || !isCreating || !captureCreateBaseline) return;
    setSavedSnapshot(
      buildCohortFormSnapshot(nameInput, emptyCohortScheduleDraft(), membershipPayloadFromDrafts()),
    );
    setCaptureCreateBaseline(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture baseline once after create init
  }, [modalOpen, isCreating, captureCreateBaseline, nameInput, membership.membersDraft, membership.regionsDraft, membership.rolesDraft]);

  function openCreate(examinerIds: string[] = []) {
    setSelectedId(null);
    setIsCreating(true);
    setSavedSnapshot(null);
    pendingPreselectedRef.current = examinerIds;
    setModalOpen(true);
    setDetailsError(null);
    setMembershipError(null);
  }

  function openSelect(id: string) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      setSavedSnapshot(snapshotFromGroup(group));
    }
    setSelectedId(id);
    setIsCreating(false);
    setModalOpen(true);
    setDetailsError(null);
    setMembershipError(null);
  }

  function openUnassigned() {
    setUnassignedModalOpen(true);
  }

  async function handleAddToCohort(cohortId: string, examinerIds: string[]) {
    if (examId == null) return;
    const group = groups.find((g) => g.id === cohortId);
    if (!group) return;

    setBusy(true);
    setLoadError(null);
    try {
      const mergedIds = [...new Set([...group.examiner_ids, ...examinerIds])];
      await replaceExaminerGroupMembers(examId, cohortId, mergedIds);
      await loadData(examId);
      setUnassignedModalOpen(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to add examiners");
    } finally {
      setBusy(false);
    }
  }

  function handleCreateWithSelected(examinerIds: string[]) {
    setUnassignedModalOpen(false);
    openCreate(examinerIds);
  }

  function cancelDetailsEdit() {
    if (savedSnapshot) {
      setNameInput(savedSnapshot.name);
    }
    setDetailsError(null);
  }

  async function handleSaveDetails(): Promise<boolean> {
    if (examId == null) return false;
    const name = nameInput.trim();
    if (!name) {
      setDetailsError("Group name is required.");
      return false;
    }

    setBusy(true);
    setDetailsError(null);
    try {
      const membershipPayload = membershipPayloadFromDrafts();

      if (isCreating) {
        const created = await createExaminerGroup(examId, { name, source_regions: [] });
        await loadData(examId);
        setIsCreating(false);
        setSelectedId(created.id);
        setSavedSnapshot(buildCohortFormSnapshot(name, emptySchedule, membershipPayload));
      } else if (selectedId) {
        await updateExaminerGroup(examId, selectedId, { name });
        await loadData(examId);
        setSavedSnapshot((prev) =>
          buildCohortFormSnapshot(
            name,
            emptySchedule,
            prev?.membership ?? membershipPayload,
          ),
        );
      }
      return true;
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : "Failed to save details");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMembership(): Promise<boolean> {
    if (examId == null) return false;
    if (isCreating && !selectedId) {
      setMembershipError("Save details first to create this group.");
      return false;
    }
    if (!selectedId) return false;

    const payload = membership.buildPayload();
    setBusy(true);
    setMembershipError(null);
    try {
      await replaceExaminerGroupSourceRegions(examId, selectedId, payload.source_regions);
      await replaceExaminerGroupMembers(examId, selectedId, payload.examiner_ids);
      await loadData(examId);
      setSavedSnapshot((prev) =>
        buildCohortFormSnapshot(
          prev?.name ?? nameInput.trim(),
          emptySchedule,
          payload,
        ),
      );
      return true;
    } catch (e) {
      setMembershipError(e instanceof Error ? e.message : "Failed to save membership");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (examId == null || !selectedId) return;
    setBusy(true);
    setMembershipError(null);
    try {
      await deleteExaminerGroup(examId, selectedId);
      closeModal();
      await loadData(examId);
    } catch (e) {
      setMembershipError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const softWarning =
    membership.selectedCount === 0 &&
    !Object.values(membership.regionsDraft).some(Boolean) &&
    !Object.values(membership.rolesDraft).some(Boolean)
      ? "This group has no membership rules or examiners yet."
      : membership.selectedCount === 0
        ? "No examiners on the roster match these rules yet."
        : null;

  const panelClass =
    embedded && !pageScroll
      ? "flex min-h-0 flex-1 flex-col overflow-hidden"
      : embedded
        ? "flex flex-col"
        : cn(EXAMINERS_PANEL_CLASS, "flex min-h-0 flex-1 flex-col overflow-hidden");

  return (
    <div className={panelClass}>
      <div className="shrink-0 border-b border-border/80 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">Marking groups</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Groups define script allocation cohorts by examiner home region. Each region can belong to
          only one group per examination.
        </p>
      </div>

      {examId == null ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-sm text-muted-foreground">Select an examination to manage groups.</p>
        </div>
      ) : (
        <>
          <CohortCoverageBar
            coverage={coverage}
            entityLabel="group"
            onShowUnassigned={openUnassigned}
            trailing={
              <Button type="button" size="sm" disabled={busy} onClick={() => openCreate()}>
                New group
              </Button>
            }
          />

          <CohortListColumn
            cohorts={cohortList}
            onSelect={openSelect}
            onNew={() => openCreate()}
            newLabel="New group"
            emptyLabel="No groups yet. Create one to assign examiners by region."
            searchPlaceholder="Search groups…"
            entityLabel="group"
            loading={loading}
            unassignedCount={coverage.unassignedCount}
            showUnassignedCount
            hideNewButton
          />

          <CohortUnassignedModal
            open={unassignedModalOpen}
            onClose={() => setUnassignedModalOpen(false)}
            entityLabel="group"
            examiners={rosterExaminers}
            unassignedIds={coverage.unassignedIds}
            cohorts={cohortList}
            busy={busy}
            onCreateWithSelected={handleCreateWithSelected}
            onAddToCohort={(cohortId, ids) => void handleAddToCohort(cohortId, ids)}
          />

          <CohortManageModal
            open={modalOpen}
            mode={isCreating ? "create" : "edit"}
            entityLabel="group"
            description="Assign examiners by home region. Each region can belong to only one group."
            name={nameInput}
            onNameChange={setNameInput}
            isDirty={isDirty}
            detailsDirty={detailsDirty}
            membershipDirty={membershipDirty}
            showRolesTab={false}
            activeTab={membership.activeTab}
            onTabChange={membership.setActiveTab}
            regionOptions={membership.regionOptions}
            roleOptions={membership.roleOptions}
            regionsDraft={membership.regionsDraft}
            rolesDraft={membership.rolesDraft}
            membersDraft={membership.membersDraft}
            claimedRegions={membership.claimedRegions}
            claimedRoles={membership.claimedRoles}
            examiners={rosterExaminers}
            unassignedIds={coverage.unassignedIds}
            peopleFilterUnassignedOnly={membership.peopleFilterUnassignedOnly}
            onPeopleFilterUnassignedOnlyChange={membership.setPeopleFilterUnassignedOnly}
            selectedCount={membership.selectedCount}
            busy={busy}
            detailsError={detailsError}
            membershipError={membershipError}
            softWarning={softWarning}
            canSaveMembership={canSaveMembership}
            deleteConfirmOpen={deleteConfirmOpen}
            onDeleteConfirmOpenChange={setDeleteConfirmOpen}
            onToggleRegion={membership.toggleRegion}
            onToggleRole={membership.toggleRole}
            onToggleExaminer={membership.toggleExaminer}
            onSaveDetails={() => handleSaveDetails()}
            onCancelDetailsEdit={cancelDetailsEdit}
            onSaveMembership={() => void handleSaveMembership()}
            onDelete={isCreating ? undefined : () => void handleDelete()}
            onClose={closeModal}
            peopleOverrideWarning="Saving regions replaces manual member changes. Your current selection will be saved as shown."
          />
        </>
      )}
    </div>
  );
}
