"use client";

import type { PaginationState, RowSelectionState, SortingState, VisibilityState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PAGE_SIZE,
  EXAMINERS_PANEL_CLASS,
  ROSTER_DEFAULT_COLUMN_VISIBILITY,
} from "@/components/examiners/constants";
import { ExaminerQuotaAssessmentModal } from "@/components/examiners/examiner-quota-assessment-modal";
import { ExaminerRegionGroupsModal } from "@/components/examiners/examiner-region-groups-modal";
import { RosterCommandBar } from "@/components/examiners/roster-command-bar";
import { RosterMobileList } from "@/components/examiners/roster-mobile-list";
import { RosterBulkUploadModal, RosterExaminerFormModal } from "@/components/examiners/roster-modals";
import { RosterTable } from "@/components/examiners/roster-table";
import type { RosterTableRow } from "@/components/examiners/types";
import { useSyncPageSubjectScope } from "@/components/examiners/use-sync-page-subject-scope";
import { clampPageSize, humanizeRegion, matchesRosterSearch } from "@/components/examiners/utils";
import { EXAMINER_TYPE_LABELS, EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { ExaminerAllocationModal } from "@/components/examiner-invitations/examiner-allocation-modal";
import { CustomSmsModal } from "@/components/examiner-invitations/invitations-modals";
import type { OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { Button } from "@/components/ui/button";
import {
  bulkSendExaminerRosterCustomSms,
  createExaminationExaminer,
  deleteExaminationExaminer,
  listExaminationExaminers,
  listExaminerGroups,
  updateExaminationExaminer,
  type ExaminerGroupRow,
  type ExaminerRosterBulkSmsResponse,
  type ExaminerRow,
  type ExaminerTypeApi,
  type Subject,
} from "@/lib/api";
import {
  bulkUploadExaminationExaminers,
  downloadExaminationExaminersBulkTemplate,
  type ExaminerBulkImportResponse,
} from "@/lib/allocation-examiners-upload";
import { REGION_OPTIONS } from "@/lib/school-enums";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  examId: number | null;
  subjects: Subject[];
  isSuperAdmin: boolean;
  lockedSubjectIds?: number[];
  embedded?: boolean;
  pageScroll?: boolean;
  loadExaminerGroups?: boolean;
  showReferenceCodesConfig?: boolean;
  showQuotaAssessment?: boolean;
  canManageRoster?: boolean;
  canEditRoster?: boolean;
  onRosterCountChange?: (count: number) => void;
  usePageSubjectScope?: boolean;
  pageSubjectTypeFilter?: ScriptControlSubjectTypeFilter;
  pageSubjectId?: string;
  mobileContactLayout?: boolean;
};

type AllocationTarget = {
  examinerId: string;
  subjectId: number;
  name: string;
};

export function ExaminersRosterPanel({
  examId,
  subjects,
  isSuperAdmin,
  lockedSubjectIds,
  embedded = false,
  pageScroll = false,
  loadExaminerGroups = true,
  showReferenceCodesConfig = false,
  showQuotaAssessment = false,
  canManageRoster = true,
  canEditRoster = true,
  onRosterCountChange,
  usePageSubjectScope = false,
  pageSubjectTypeFilter = "all",
  pageSubjectId = "",
  mobileContactLayout = false,
}: Props) {
  const [examiners, setExaminers] = useState<ExaminerRow[]>([]);
  const [groups, setGroups] = useState<ExaminerGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(ROSTER_DEFAULT_COLUMN_VISIBILITY);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [customPageSizeInput, setCustomPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [customPageSizeEditing, setCustomPageSizeEditing] = useState(false);

  useSyncPageSubjectScope({
    enabled: usePageSubjectScope,
    pageSubjectTypeFilter,
    pageSubjectId,
    setSubjectTypeFilter,
    setSubjectFilter,
  });

  const [regionGroupsOpen, setRegionGroupsOpen] = useState(false);
  const [quotaAssessmentOpen, setQuotaAssessmentOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExaminerRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [examinerType, setExaminerType] = useState<ExaminerTypeApi>("assistant_examiner");
  const [subjectId, setSubjectId] = useState("");
  const [region, setRegion] = useState("");
  const [gender, setGender] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ExaminerBulkImportResponse | null>(null);

  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsSingleTarget, setSmsSingleTarget] = useState<RosterTableRow | null>(null);
  const [customSmsMessage, setCustomSmsMessage] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState<ExaminerRosterBulkSmsResponse | null>(null);
  const [allocationTarget, setAllocationTarget] = useState<AllocationTarget | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!actionMessage) return;
    const t = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMessage]);

  const loadData = useCallback(async (eid: number) => {
    setLoadError(null);
    setLoading(true);
    try {
      const list = await listExaminationExaminers(eid);
      let groupList: ExaminerGroupRow[] = [];
      if (loadExaminerGroups) {
        try {
          groupList = await listExaminerGroups(eid);
        } catch (e) {
          // Subject officers cannot list marking groups; roster still works without group names.
          if (!(e instanceof Error && e.message === "Insufficient permissions")) {
            throw e;
          }
        }
      }
      setExaminers(list);
      setGroups(groupList);
      onRosterCountChange?.(list.length);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load roster");
      setExaminers([]);
      setGroups([]);
      onRosterCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [loadExaminerGroups, onRosterCountChange]);

  useEffect(() => {
    if (examId == null) {
      setExaminers([]);
      setGroups([]);
      onRosterCountChange?.(0);
      return;
    }
    void loadData(examId);
  }, [examId, loadData, onRosterCountChange]);

  useEffect(() => {
    setRowSelection({});
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [examId, debouncedSearch, subjectTypeFilter, roleFilter, regionFilter, subjectFilter]);

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const subjectLabel = useCallback(
    (id: number) => {
      const s = subjects.find((x) => x.id === id);
      return s ? `${s.original_code?.trim() || s.code} — ${s.name}` : String(id);
    },
    [subjects],
  );

  const subjectOptions = useMemo(
    () =>
      subjects
        .filter((s) => subjectTypeFilter === "all" || s.subject_type === subjectTypeFilter)
        .map((s) => ({
          value: String(s.id),
          label: `${s.original_code?.trim() || s.code} — ${s.name}`,
        })),
    [subjects, subjectTypeFilter],
  );

  const formSubjectOptions = useMemo(
    () =>
      subjects.map((s) => ({
        value: String(s.id),
        label: `${s.original_code?.trim() || s.code} — ${s.name}`,
      })),
    [subjects],
  );

  const regionOptions = useMemo(
    () => REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    [],
  );

  const roleOptions = useMemo(
    () => EXAMINER_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const tableRows = useMemo((): RosterTableRow[] => {
    return examiners
      .filter((e) => {
        if (subjectTypeFilter !== "all") {
          const sid = e.subject_ids[0];
          const subject = sid != null ? subjectById.get(sid) : undefined;
          if (!subject || subject.subject_type !== subjectTypeFilter) return false;
        }
        if (roleFilter.length > 0 && !roleFilter.includes(e.examiner_type)) return false;
        if (regionFilter.length > 0 && !regionFilter.includes(e.region)) return false;
        if (subjectFilter.length > 0) {
          const sid = e.subject_ids[0];
          if (sid == null || !subjectFilter.includes(String(sid))) return false;
        }
        if (!matchesRosterSearch(e.name, e.phone_number, debouncedSearch, e.reference_code)) return false;
        return true;
      })
      .map((e) => ({
        ...e,
        subjectLabel: e.subject_ids[0] != null ? subjectLabel(e.subject_ids[0]) : "—",
        groupLabel: e.examiner_group_id
          ? groups.find((g) => g.id === e.examiner_group_id)?.name ?? e.examiner_group_id.slice(0, 8)
          : null,
      }));
  }, [examiners, groups, subjectTypeFilter, subjectById, roleFilter, regionFilter, subjectFilter, debouncedSearch, subjectLabel]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (!usePageSubjectScope && subjectTypeFilter !== "all") n += 1;
    n += roleFilter.length + regionFilter.length;
    if (!usePageSubjectScope) n += subjectFilter.length;
    return n;
  }, [roleFilter.length, regionFilter.length, subjectFilter.length, subjectTypeFilter, usePageSubjectScope]);

  const selectedCount = Object.keys(rowSelection).length;
  const hasActiveFilters =
    activeFilterCount > 0 || debouncedSearch.trim().length > 0 || subjectTypeFilter !== "all";

  const smsTargetRows = useMemo(() => {
    if (smsSingleTarget) return [smsSingleTarget];
    if (selectedCount > 0) {
      return tableRows.filter((row) => rowSelection[row.id]);
    }
    return tableRows;
  }, [smsSingleTarget, tableRows, rowSelection, selectedCount]);

  const filterChips = useMemo((): OfficialAccountsFilterChip[] => {
    const chips: OfficialAccountsFilterChip[] = [];
    if (debouncedSearch.trim()) {
      chips.push({
        id: "search",
        label: `Search: ${debouncedSearch.trim()}`,
        onRemove: () => setSearchQuery(""),
      });
    }
    if (!usePageSubjectScope && subjectTypeFilter !== "all") {
      const label =
        SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.find((o) => o.value === subjectTypeFilter)?.label ??
        subjectTypeFilter;
      chips.push({
        id: "subject-type",
        label: `Subject type: ${label}`,
        onRemove: () => {
          setSubjectTypeFilter("all");
          setSubjectFilter([]);
        },
      });
    }
    for (const role of roleFilter) {
      chips.push({
        id: `role-${role}`,
        label: `Role: ${EXAMINER_TYPE_LABELS[role as ExaminerTypeApi] ?? role}`,
        onRemove: () => setRoleFilter((prev) => prev.filter((v) => v !== role)),
      });
    }
    for (const reg of regionFilter) {
      const opt = regionOptions.find((o) => o.value === reg);
      chips.push({
        id: `region-${reg}`,
        label: `Region: ${opt?.label ?? humanizeRegion(reg)}`,
        onRemove: () => setRegionFilter((prev) => prev.filter((v) => v !== reg)),
      });
    }
    if (!usePageSubjectScope) {
      for (const id of subjectFilter) {
        const opt = subjectOptions.find((o) => o.value === id);
        chips.push({
          id: `subject-${id}`,
          label: `Subject: ${opt?.label ?? id}`,
          onRemove: () => setSubjectFilter((prev) => prev.filter((v) => v !== id)),
        });
      }
    }
    return chips;
  }, [debouncedSearch, subjectTypeFilter, roleFilter, regionFilter, subjectFilter, regionOptions, subjectOptions, usePageSubjectScope]);

  function clearFilters() {
    setSearchQuery("");
    if (!usePageSubjectScope) {
      setSubjectTypeFilter("all");
      setSubjectFilter([]);
    }
    setRoleFilter([]);
    setRegionFilter([]);
  }

  function handleSubjectTypeFilterChange(next: ScriptControlSubjectTypeFilter) {
    setSubjectTypeFilter(next);
    if (next === "all") return;
    const validIds = new Set(
      subjects.filter((s) => s.subject_type === next).map((s) => String(s.id)),
    );
    setSubjectFilter((prev) => prev.filter((id) => validIds.has(id)));
  }

  function handlePageSizeSelectChange(value: string) {
    if (value === "custom") {
      setCustomPageSizeEditing(true);
      const n = clampPageSize(Number.parseInt(customPageSizeInput, 10));
      setCustomPageSizeInput(String(n));
      setPagination({ pageIndex: 0, pageSize: n });
      return;
    }
    const n = clampPageSize(Number.parseInt(value, 10));
    setCustomPageSizeInput(String(n));
    setCustomPageSizeEditing(false);
    setPagination({ pageIndex: 0, pageSize: n });
  }

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setExaminerType("assistant_examiner");
    setSubjectId("");
    setRegion("");
    setGender("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: RosterTableRow) {
    setEditing(row);
    setName(row.name);
    setPhone(row.phone_number ?? "");
    setExaminerType(row.examiner_type);
    setSubjectId(row.subject_ids[0] != null ? String(row.subject_ids[0]) : "");
    setRegion(row.region?.trim() ?? "");
    setGender(row.gender ?? "");
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSave() {
    if (examId == null || !name.trim() || !phone.trim() || !subjectId || !region.trim()) {
      setFormError("All fields are required.");
      return;
    }
    const sid = Number(subjectId);
    if (!Number.isFinite(sid)) {
      setFormError("Pick a valid subject.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await updateExaminationExaminer(examId, editing.id, {
          name: name.trim(),
          phone_number: phone.trim(),
          examiner_type: examinerType,
          subject_ids: [sid],
          region: region.trim(),
          gender: gender.trim() || null,
        });
        setActionMessage("Examiner updated.");
      } else {
        await createExaminationExaminer(examId, {
          name: name.trim(),
          phone_number: phone.trim(),
          examiner_type: examinerType,
          subject_ids: [sid],
          region: region.trim(),
          gender: gender.trim() || null,
        });
        setActionMessage("Examiner added.");
      }
      setFormOpen(false);
      setEditing(null);
      await loadData(examId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row: RosterTableRow) {
    if (examId == null) return;
    if (!window.confirm(`Remove ${row.name} from this examination?`)) return;
    setBusy(true);
    setLoadError(null);
    try {
      await deleteExaminationExaminer(examId, row.id);
      setActionMessage("Examiner removed.");
      await loadData(examId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkFile(file: File) {
    if (examId == null) return;
    setBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await bulkUploadExaminationExaminers(examId, file);
      setUploadResult(res);
      await loadData(examId);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function closeSmsModal() {
    if (busy) return;
    setSmsModalOpen(false);
    setSmsSingleTarget(null);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
  }

  function openCustomSmsForExaminer(row: RosterTableRow) {
    setSmsSingleTarget(row);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
    setSmsModalOpen(true);
  }

  async function handleBulkSms() {
    if (examId == null || !customSmsMessage.trim()) {
      setSmsError("Enter a message.");
      return;
    }
    if (smsTargetRows.length === 0) {
      setSmsError("No recipients match the current selection or filters.");
      return;
    }
    setBusy(true);
    setSmsError(null);
    setSmsResult(null);
    try {
      const res = await bulkSendExaminerRosterCustomSms(examId, {
        examiner_ids: smsTargetRows.map((r) => r.id),
        message: customSmsMessage.trim(),
      });
      if (res.sent_count > 0) {
        setActionMessage(`Custom SMS sent to ${res.sent_count} examiner${res.sent_count === 1 ? "" : "s"}.`);
      } else if (res.failed_count > 0) {
        setActionMessage(`SMS failed for ${res.failed_count} examiner${res.failed_count === 1 ? "" : "s"}.`);
      }
      setSmsModalOpen(false);
      setSmsSingleTarget(null);
      setCustomSmsMessage("");
      setSmsError(null);
      setSmsResult(null);
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : "SMS send failed");
    } finally {
      setBusy(false);
    }
  }

  const smsRecipientLabel = smsSingleTarget
    ? smsSingleTarget.name
    : selectedCount > 0
      ? "selected rows"
      : hasActiveFilters
        ? "filtered rows"
        : "all examiners on roster";

  return (
    <>
      {loadError ? (
        <p className="mx-3 mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-4">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p
          className="mx-3 mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground sm:mx-4"
          role="status"
        >
          {actionMessage}
        </p>
      ) : null}

      <section
        className={cn(
          embedded && !pageScroll
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : embedded
              ? "flex flex-col"
              : EXAMINERS_PANEL_CLASS,
          !embedded && "flex min-h-0 flex-1 flex-col",
        )}
      >
        <RosterCommandBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchDisabled={examId == null}
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeFilterChange={handleSubjectTypeFilterChange}
          roleOptions={roleOptions}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          regionOptions={regionOptions}
          regionFilter={regionFilter}
          onRegionFilterChange={setRegionFilter}
          subjectOptions={subjectOptions}
          subjectFilter={subjectFilter}
          onSubjectFilterChange={setSubjectFilter}
          activeFilterCount={activeFilterCount}
          filterChips={filterChips}
          onClearFilters={clearFilters}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          selectedCount={selectedCount}
          filteredCount={tableRows.length}
          onSendSms={() => {
            setSmsSingleTarget(null);
            setSmsError(null);
            setSmsResult(null);
            setCustomSmsMessage("");
            setSmsModalOpen(true);
          }}
          onAdd={openAdd}
          onBulkUpload={() => {
            setUploadError(null);
            setUploadResult(null);
            setUploadOpen(true);
          }}
          showBulkUpload={canManageRoster && isSuperAdmin}
          canManageRoster={canManageRoster}
          showReferenceCodesConfig={showReferenceCodesConfig}
          onConfigureReferenceCodes={() => setRegionGroupsOpen(true)}
          showQuotaAssessment={showQuotaAssessment}
          onTestQuota={() => setQuotaAssessmentOpen(true)}
          busy={busy || loading}
          disabled={examId == null}
          embedded={embedded}
          hideSubjectScopeFilters={usePageSubjectScope}
          mobileContactLayout={mobileContactLayout}
        />

        <div
          className={cn(
            pageScroll ? "flex flex-col gap-2 p-2 sm:p-3" : "flex min-h-0 flex-1 flex-col overflow-hidden",
          )}
        >
            {!loading && examiners.length === 0 ? (
              <div className="flex min-h-[14rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No examiners on roster yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {canManageRoster
                      ? "Add examiners directly or invite them from the Invitations tab."
                      : "Examiners will appear here once administrators add them to the roster."}
                  </p>
                </div>
                {canManageRoster ? (
                  <Button type="button" size="sm" disabled={busy} onClick={openAdd}>
                    Add first examiner
                  </Button>
                ) : null}
              </div>
            ) : !loading && tableRows.length === 0 ? (
              <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No examiners match your filters</p>
                <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className={mobileContactLayout ? "hidden md:block" : undefined}>
                  <RosterTable
                    rows={tableRows}
                    loading={loading}
                    busy={busy}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    pagination={pagination}
                    onPaginationChange={setPagination}
                    showCustomPageSizeInput={customPageSizeEditing}
                    customPageSizeInput={customPageSizeInput}
                    onPageSizeSelectChange={handlePageSizeSelectChange}
                    onCustomPageSizeChange={setCustomPageSizeInput}
                    onCustomPageSizeBlur={() => {
                      const n = clampPageSize(Number.parseInt(customPageSizeInput, 10));
                      setCustomPageSizeInput(String(n));
                      setCustomPageSizeEditing(false);
                      setPagination({ pageIndex: 0, pageSize: n });
                    }}
                    onEdit={openEdit}
                    onRemove={(row) => void handleRemove(row)}
                    canEditRoster={canEditRoster}
                    pageScroll={pageScroll}
                    onViewAllocation={
                      lockedSubjectIds != null
                        ? (row) => {
                            const subjectId = row.subject_ids[0];
                            if (subjectId == null) return;
                            setAllocationTarget({
                              examinerId: row.id,
                              subjectId,
                              name: row.name,
                            });
                          }
                        : undefined
                    }
                  />
                </div>
                {mobileContactLayout && !loading && tableRows.length > 0 ? (
                  <RosterMobileList
                    rows={tableRows}
                    pagination={pagination}
                    onPaginationChange={setPagination}
                    showCustomPageSizeInput={customPageSizeEditing}
                    customPageSizeInput={customPageSizeInput}
                    onPageSizeSelectChange={handlePageSizeSelectChange}
                    onCustomPageSizeChange={setCustomPageSizeInput}
                    onCustomPageSizeBlur={() => {
                      const n = clampPageSize(Number.parseInt(customPageSizeInput, 10));
                      setCustomPageSizeInput(String(n));
                      setCustomPageSizeEditing(false);
                      setPagination({ pageIndex: 0, pageSize: n });
                    }}
                    busy={busy}
                    canEditRoster={canEditRoster}
                    onInAppSms={openCustomSmsForExaminer}
                    onEdit={openEdit}
                    onRemove={(row) => void handleRemove(row)}
                    onViewAllocation={
                      lockedSubjectIds != null
                        ? (row) => {
                            const subjectId = row.subject_ids[0];
                            if (subjectId == null) return;
                            setAllocationTarget({
                              examinerId: row.id,
                              subjectId,
                              name: row.name,
                            });
                          }
                        : undefined
                    }
                  />
                ) : null}
              </>
            )}
          </div>
      </section>

      <RosterExaminerFormModal
        open={formOpen}
        editing={editing != null}
        busy={busy}
        error={formError}
        name={name}
        phone={phone}
        examinerType={examinerType}
        subjectId={subjectId}
        region={region}
        gender={gender}
        subjectOptions={formSubjectOptions}
        regionOptions={regionOptions}
        onClose={closeForm}
        onSubmit={() => void handleSave()}
        onNameChange={setName}
        onPhoneChange={setPhone}
        onExaminerTypeChange={setExaminerType}
        onSubjectIdChange={setSubjectId}
        onRegionChange={setRegion}
        onGenderChange={setGender}
      />

      <RosterBulkUploadModal
        open={uploadOpen}
        busy={busy}
        error={uploadError}
        result={uploadResult}
        onClose={() => {
          if (!busy) {
            setUploadOpen(false);
            setUploadError(null);
            setUploadResult(null);
          }
        }}
        onDownloadTemplate={() => {
          if (examId == null) return;
          void downloadExaminationExaminersBulkTemplate(examId).catch((err: unknown) => {
            setUploadError(err instanceof Error ? err.message : "Template download failed");
          });
        }}
        onFileSelected={(file) => void handleBulkFile(file)}
      />

      <CustomSmsModal
        open={smsModalOpen}
        busy={busy}
        error={smsError}
        result={smsResult}
        message={customSmsMessage}
        recipientCount={smsTargetRows.length}
        recipientLabel={smsRecipientLabel}
        recipientNoun="examiner"
        onClose={closeSmsModal}
        onSubmit={() => void handleBulkSms()}
        onMessageChange={setCustomSmsMessage}
      />

      <ExaminerAllocationModal
        open={allocationTarget != null}
        onClose={() => setAllocationTarget(null)}
        examinationId={examId}
        subjectId={allocationTarget?.subjectId ?? null}
        examinerId={allocationTarget?.examinerId ?? null}
        examinerName={allocationTarget?.name ?? ""}
      />

      <ExaminerRegionGroupsModal
        open={regionGroupsOpen}
        examId={examId}
        onOpenChange={setRegionGroupsOpen}
        onCodesUpdated={() => {
          if (examId != null) void loadData(examId);
        }}
      />

      <ExaminerQuotaAssessmentModal
        open={quotaAssessmentOpen}
        examId={examId}
        subjects={subjects}
        onOpenChange={setQuotaAssessmentOpen}
      />
    </>
  );
}
