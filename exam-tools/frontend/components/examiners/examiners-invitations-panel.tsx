"use client";

import type { PaginationState, RowSelectionState, SortingState, VisibilityState } from "@tanstack/react-table";
import { MailPlus, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InvitationsCommandBar } from "@/components/examiner-invitations/invitations-command-bar";
import {
  DEFAULT_COLUMN_VISIBILITY,
  DEFAULT_PAGE_SIZE,
  EXAMINER_TYPE_LABELS,
  EXAMINER_TYPE_OPTIONS,
  INVITATIONS_PANEL_CLASS,
  STATUS_LABELS,
} from "@/components/examiner-invitations/constants";
import {
  BulkUploadModal,
  CustomSmsModal,
  InviteExaminerModal,
  SetCoordinationDateModal,
} from "@/components/examiner-invitations/invitations-modals";
import { InvitationsStatusTabs } from "@/components/examiner-invitations/invitations-status-tabs";
import { InvitationsSummaryStats } from "@/components/examiner-invitations/invitations-summary-stats";
import { InvitationsTable } from "@/components/examiner-invitations/invitations-table";
import type {
  InvitationStatusCounts,
  InvitationStatusFilter,
  ResendUiState,
} from "@/components/examiner-invitations/types";
import {
  clampPageSize,
  dateInputToIso,
  datetimeLocalToIso,
  canReceiveCoordinationSms,
  coordinationSmsSelectionBlockedReason,
  matchesSearchQuery,
} from "@/components/examiner-invitations/utils";
import type { OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { Button } from "@/components/ui/button";
import {
  bulkSendExaminerInvitationCustomSms,
  bulkSetExaminerInvitationCoordinationDate,
  bulkUploadExaminerInvitations,
  createExaminerInvitation,
  downloadExaminerInvitationsBulkTemplate,
  listExaminerInvitations,
  resendExaminerInvitationSms,
  type ExaminerInvitationBulkImportResponse,
  type ExaminerInvitationBulkSmsResponse,
  type ExaminerInvitationRow,
  type ExaminerTypeApi,
  type Subject,
} from "@/lib/api";
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
  onInvitationCountsChange?: (counts: InvitationStatusCounts) => void;
};

function countByStatus(rows: ExaminerInvitationRow[]): InvitationStatusCounts {
  const counts: InvitationStatusCounts = {
    total: rows.length,
    pending: 0,
    accepted: 0,
    declined: 0,
    expired: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

export function ExaminersInvitationsPanel({ examId, subjects, onInvitationCountsChange }: Props) {
  const [invitations, setInvitations] = useState<ExaminerInvitationRow[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageTone, setActionMessageTone] = useState<"success" | "error">("success");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [coordinationModalOpen, setCoordinationModalOpen] = useState(false);
  const [coordinationModalError, setCoordinationModalError] = useState<string | null>(null);
  const [batchCoordinationDateInput, setBatchCoordinationDateInput] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ExaminerInvitationBulkImportResponse | null>(null);
  const [sendSmsOnBulk, setSendSmsOnBulk] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState<ExaminerInvitationBulkSmsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendSms, setSendSms] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examinerType, setExaminerType] = useState<ExaminerTypeApi>("assistant_examiner");
  const [region, setRegion] = useState("");
  const [responseDeadlineInput, setResponseDeadlineInput] = useState("");
  const [coordinationDateInput, setCoordinationDateInput] = useState("");
  const [bulkResponseDeadlineInput, setBulkResponseDeadlineInput] = useState("");
  const [bulkCoordinationDateInput, setBulkCoordinationDateInput] = useState("");
  const [customSmsMessage, setCustomSmsMessage] = useState("");

  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<InvitationStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [customPageSizeInput, setCustomPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [customPageSizeEditing, setCustomPageSizeEditing] = useState(false);
  const [resendUi, setResendUi] = useState<Record<string, ResendUiState>>({});
  const [resendErrors, setResendErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (actionMessageTone !== "success" || !actionMessage) return;
    const t = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMessage, actionMessageTone]);

  const loadInvitations = useCallback(async (eid: number) => {
    setLoadError(null);
    setLoadingInvitations(true);
    try {
      setInvitations(await listExaminerInvitations(eid));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load invitations");
      setInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => {
    if (examId == null) {
      setInvitations([]);
      return;
    }
    void loadInvitations(examId);
  }, [examId, loadInvitations]);

  useEffect(() => {
    if (onInvitationCountsChange) {
      onInvitationCountsChange(countByStatus(invitations));
    }
  }, [invitations, onInvitationCountsChange]);

  useEffect(() => {
    setRowSelection({});
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [examId, subjectTypeFilter, subjectFilter, roleFilter, regionFilter, statusFilter, debouncedSearch]);

  const subjectOptions = useMemo(
    () =>
      subjects
        .filter((s) => subjectTypeFilter === "all" || s.subject_type === subjectTypeFilter)
        .map((s) => {
          const code = (s.original_code?.trim() || s.code).trim();
          return { value: String(s.id), label: `${code} — ${s.name}` };
        }),
    [subjects, subjectTypeFilter],
  );

  const inviteSubjectOptions = useMemo(
    () =>
      subjects.map((s) => {
        const code = (s.original_code?.trim() || s.code).trim();
        return { value: String(s.id), label: `${code} — ${s.name}` };
      }),
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

  const preStatusFilteredRows = useMemo(() => {
    return invitations.filter((inv) => {
      if (subjectTypeFilter !== "all" && inv.subject_type !== subjectTypeFilter) return false;
      if (subjectFilter.length > 0 && !subjectFilter.includes(String(inv.subject_id))) return false;
      if (roleFilter.length > 0 && !roleFilter.includes(inv.examiner_type)) return false;
      if (regionFilter.length > 0 && !regionFilter.includes(inv.region)) return false;
      if (!matchesSearchQuery(inv.name, inv.phone_number, debouncedSearch)) return false;
      return true;
    });
  }, [invitations, subjectTypeFilter, subjectFilter, roleFilter, regionFilter, debouncedSearch]);

  const statusCounts = useMemo(() => countByStatus(preStatusFilteredRows), [preStatusFilteredRows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return preStatusFilteredRows;
    return preStatusFilteredRows.filter((inv) => inv.status === statusFilter);
  }, [preStatusFilteredRows, statusFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pagination.pageSize));
    if (pagination.pageIndex >= totalPages) {
      setPagination((p) => ({ ...p, pageIndex: Math.max(0, totalPages - 1) }));
    }
  }, [filteredRows.length, pagination.pageIndex, pagination.pageSize]);

  const selectedCount = Object.keys(rowSelection).length;
  const smsTargetRows = useMemo(() => {
    if (selectedCount > 0) {
      return filteredRows.filter((row) => rowSelection[row.id]);
    }
    return filteredRows;
  }, [filteredRows, rowSelection, selectedCount]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (statusFilter !== "all") n += 1;
    if (subjectTypeFilter !== "all") n += 1;
    n += subjectFilter.length + roleFilter.length + regionFilter.length;
    return n;
  }, [statusFilter, subjectTypeFilter, subjectFilter, roleFilter, regionFilter]);

  const hasActiveFilters =
    activeFilterCount > 0 || statusFilter !== "all" || debouncedSearch.trim().length > 0;

  const filterChips = useMemo((): OfficialAccountsFilterChip[] => {
    const chips: OfficialAccountsFilterChip[] = [];
    if (debouncedSearch.trim()) {
      chips.push({
        id: "search",
        label: `Search: ${debouncedSearch.trim()}`,
        onRemove: () => setSearchQuery(""),
      });
    }
    if (statusFilter !== "all") {
      chips.push({
        id: "status",
        label: `Status: ${STATUS_LABELS[statusFilter]}`,
        onRemove: () => setStatusFilter("all"),
      });
    }
    if (subjectTypeFilter !== "all") {
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
    for (const id of subjectFilter) {
      const opt = subjectOptions.find((o) => o.value === id);
      chips.push({
        id: `subject-${id}`,
        label: `Subject: ${opt?.label ?? id}`,
        onRemove: () => setSubjectFilter((prev) => prev.filter((v) => v !== id)),
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
        label: `Region: ${opt?.label ?? reg}`,
        onRemove: () => setRegionFilter((prev) => prev.filter((v) => v !== reg)),
      });
    }
    return chips;
  }, [
    debouncedSearch,
    statusFilter,
    subjectTypeFilter,
    subjectFilter,
    roleFilter,
    regionFilter,
    subjectOptions,
    regionOptions,
  ]);

  function clearAllFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setSubjectTypeFilter("all");
    setSubjectFilter([]);
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

  function handleCustomPageSizeChange(value: string) {
    setCustomPageSizeInput(value);
    setCustomPageSizeEditing(true);
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return;
    setPagination({ pageIndex: 0, pageSize: clampPageSize(n) });
  }

  function handleCustomPageSizeBlur() {
    const n = clampPageSize(Number.parseInt(customPageSizeInput, 10));
    setCustomPageSizeInput(String(n));
    setCustomPageSizeEditing(false);
    setPagination({ pageIndex: 0, pageSize: n });
  }

  const handleResend = useCallback(
    async (inv: ExaminerInvitationRow) => {
      if (examId == null) return;
      setResendUi((prev) => ({ ...prev, [inv.id]: "sending" }));
      setResendErrors((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
      setActionMessage(null);
      try {
        const res = await resendExaminerInvitationSms(examId, inv.id);
        if (res.sms_sent) {
          setResendUi((prev) => ({ ...prev, [inv.id]: "success" }));
          setActionMessageTone("success");
          setActionMessage(`Invitation SMS resent to ${inv.name}.`);
          window.setTimeout(() => {
            setResendUi((prev) => {
              if (prev[inv.id] !== "success") return prev;
              const next = { ...prev };
              delete next[inv.id];
              return next;
            });
          }, 5000);
        } else {
          const errMsg = res.sms_error ?? "SMS could not be sent.";
          setResendUi((prev) => ({ ...prev, [inv.id]: "error" }));
          setResendErrors((prev) => ({ ...prev, [inv.id]: errMsg }));
          setActionMessageTone("error");
          setActionMessage(`Could not resend invitation SMS to ${inv.name}: ${errMsg}`);
        }
        await loadInvitations(examId);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Resend failed";
        setResendUi((prev) => ({ ...prev, [inv.id]: "error" }));
        setResendErrors((prev) => ({ ...prev, [inv.id]: errMsg }));
        setActionMessageTone("error");
        setActionMessage(errMsg);
      }
    },
    [examId, loadInvitations],
  );

  function resetInviteForm() {
    setName("");
    setPhone("");
    setSubjectId("");
    setRegion("");
    setExaminerType("assistant_examiner");
    setSendSms(true);
    setResponseDeadlineInput("");
    setCoordinationDateInput("");
  }

  function closeUploadModal() {
    setUploadModalOpen(false);
    setUploadError(null);
    setUploadResult(null);
    setSendSmsOnBulk(false);
    setBulkFile(null);
    setBulkResponseDeadlineInput("");
    setBulkCoordinationDateInput("");
  }

  function closeSmsModal() {
    setSmsModalOpen(false);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
  }

  async function handleInvite() {
    if (examId == null || !name.trim() || !phone.trim() || !subjectId || !region.trim()) {
      setInviteError("All fields are required.");
      return;
    }
    if (!responseDeadlineInput.trim()) {
      setInviteError("Respond-by deadline is required.");
      return;
    }
    const responseDeadlineIso = datetimeLocalToIso(responseDeadlineInput);
    if (!responseDeadlineIso) {
      setInviteError("Enter a valid respond-by date and time.");
      return;
    }
    const sid = Number(subjectId);
    if (!Number.isFinite(sid)) {
      setInviteError("Pick a valid subject.");
      return;
    }
    setBusy(true);
    setInviteError(null);
    try {
      await createExaminerInvitation(examId, {
        name: name.trim(),
        phone_number: phone.trim(),
        subject_id: sid,
        examiner_type: examinerType,
        region: region.trim(),
        send_sms: sendSms,
        response_deadline: responseDeadlineIso,
        coordination_date: dateInputToIso(coordinationDateInput),
      });
      resetInviteForm();
      setInviteModalOpen(false);
      setActionMessageTone("success");
      setActionMessage("Invitation sent.");
      await loadInvitations(examId);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpload() {
    if (examId == null || !bulkFile) return;
    if (!bulkResponseDeadlineInput.trim()) {
      setUploadError("Respond-by deadline is required.");
      return;
    }
    const responseDeadlineIso = datetimeLocalToIso(bulkResponseDeadlineInput);
    if (!responseDeadlineIso) {
      setUploadError("Enter a valid respond-by date and time.");
      return;
    }
    setBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await bulkUploadExaminerInvitations(examId, bulkFile, {
        sendSms: sendSmsOnBulk,
        responseDeadline: responseDeadlineIso,
        coordinationDate: dateInputToIso(bulkCoordinationDateInput),
      });
      setUploadResult(res);
      setBulkFile(null);
      await loadInvitations(examId);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  }

  function closeCoordinationModal() {
    setCoordinationModalOpen(false);
    setCoordinationModalError(null);
    setBatchCoordinationDateInput("");
  }

  async function handleSetCoordinationDate() {
    if (examId == null || selectedCount === 0) return;
    const coordinationIso = dateInputToIso(batchCoordinationDateInput);
    if (!coordinationIso) {
      setCoordinationModalError("Enter a valid coordination date.");
      return;
    }
    const invitationIds = filteredRows.filter((row) => rowSelection[row.id]).map((row) => row.id);
    setBusy(true);
    setCoordinationModalError(null);
    try {
      const res = await bulkSetExaminerInvitationCoordinationDate(examId, {
        invitation_ids: invitationIds,
        coordination_date: coordinationIso,
      });
      await loadInvitations(examId);
      closeCoordinationModal();
      setActionMessageTone(res.errors.length ? "error" : "success");
      if (res.errors.length) {
        setActionMessage(
          `Updated ${res.updated_count} invitation(s). ${res.errors.length} could not be updated.`,
        );
      } else {
        setActionMessage(`Coordination date set for ${res.updated_count} invitation(s).`);
        const acceptedSelected = filteredRows.filter(
          (row) => rowSelection[row.id] && canReceiveCoordinationSms(row.status),
        );
        if (acceptedSelected.length > 0) {
          setRowSelection(Object.fromEntries(acceptedSelected.map((row) => [row.id, true])));
          setCustomSmsMessage("Your coordination meeting is on {coordination_date}.");
          setSmsError(null);
          setSmsResult(null);
          setSmsModalOpen(true);
        } else if (invitationIds.length > 0) {
          setActionMessageTone("success");
          setActionMessage(
            `Coordination date saved for ${res.updated_count} invitation(s). SMS was not opened because none of the selected invitees have accepted yet.`,
          );
        }
      }
    } catch (e) {
      setCoordinationModalError(e instanceof Error ? e.message : "Could not save coordination date");
    } finally {
      setBusy(false);
    }
  }

  const smsRecipientLabel =
    selectedCount > 0 ? "selected rows" : hasActiveFilters ? "filtered rows" : "all invitations";

  const coordinationSmsBlockedReason = useMemo(
    () => coordinationSmsSelectionBlockedReason(smsTargetRows, customSmsMessage),
    [smsTargetRows, customSmsMessage],
  );

  async function handleBulkSms() {
    if (examId == null || !customSmsMessage.trim()) {
      setSmsError("Enter a message.");
      return;
    }
    const message = customSmsMessage.trim();
    const blockedReason = coordinationSmsSelectionBlockedReason(smsTargetRows, message);
    if (blockedReason) {
      setSmsError(blockedReason);
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
      const res = await bulkSendExaminerInvitationCustomSms(examId, {
        invitation_ids: smsTargetRows.map((r) => r.id),
        message,
      });
      if (res.sent_count > 0) {
        setActionMessageTone("success");
        setActionMessage(
          `Custom SMS sent to ${res.sent_count} invitee${res.sent_count === 1 ? "" : "s"}.`,
        );
        await loadInvitations(examId);
      } else if (res.failed_count > 0) {
        setActionMessageTone("error");
        setActionMessage(`SMS failed for ${res.failed_count} invitee${res.failed_count === 1 ? "" : "s"}.`);
      }
      setSmsModalOpen(false);
      setCustomSmsMessage("");
      setSmsError(null);
      setSmsResult(null);
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : "SMS send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            actionMessageTone === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border border-destructive/40 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {actionMessage}
        </p>
      ) : null}

      <section className={cn(INVITATIONS_PANEL_CLASS, "flex min-h-0 flex-1 flex-col")}>
        <InvitationsCommandBar
          exams={[]}
          examId={examId}
          onExamChange={() => {}}
          formatExamLabel={() => ""}
          hideExamPicker
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchDisabled={examId == null}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeFilterChange={handleSubjectTypeFilterChange}
          subjectOptions={subjectOptions}
          subjectFilter={subjectFilter}
          onSubjectFilterChange={setSubjectFilter}
          roleOptions={roleOptions}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          regionOptions={regionOptions}
          regionFilter={regionFilter}
          onRegionFilterChange={setRegionFilter}
          activeFilterCount={activeFilterCount}
          filterChips={filterChips}
          onClearFilters={clearAllFilters}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          selectedCount={selectedCount}
          filteredCount={filteredRows.length}
          onSendSms={() => {
            setSmsError(null);
            setSmsResult(null);
            setCustomSmsMessage("");
            setSmsModalOpen(true);
          }}
          onSetCoordinationDate={() => {
            setCoordinationModalError(null);
            setBatchCoordinationDateInput("");
            setCoordinationModalOpen(true);
          }}
          onBulkUpload={() => {
            setUploadError(null);
            setUploadResult(null);
            setUploadModalOpen(true);
          }}
          onInvite={() => {
            setInviteError(null);
            setInviteModalOpen(true);
          }}
          busy={busy || loadingInvitations}
          disabled={examId == null}
        />

        {examId == null ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Select an examination</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Choose an examination above to view and manage examiner invitations.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
            <InvitationsSummaryStats
              counts={statusCounts}
              activeStatus={statusFilter}
              onStatusClick={setStatusFilter}
            />
            <InvitationsStatusTabs
              active={statusFilter}
              counts={statusCounts}
              onChange={setStatusFilter}
            />

            {selectedCount > 0 ? (
              <p className="text-sm text-muted-foreground">{selectedCount} selected</p>
            ) : null}

            {!loadingInvitations && invitations.length === 0 ? (
              <div className="flex min-h-[14rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No invitations yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Send individual invitations or upload a spreadsheet to invite examiners for this
                    examination.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => {
                      setInviteError(null);
                      setInviteModalOpen(true);
                    }}
                  >
                    <MailPlus className="size-4" aria-hidden />
                    Invite examiner
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => {
                      setUploadError(null);
                      setUploadResult(null);
                      setUploadModalOpen(true);
                    }}
                  >
                    <Upload className="size-4" aria-hidden />
                    Bulk upload
                  </Button>
                </div>
              </div>
            ) : !loadingInvitations && filteredRows.length === 0 ? (
              <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No invitations match your filters</p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={clearAllFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <InvitationsTable
                rows={filteredRows}
                loading={loadingInvitations}
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
                onCustomPageSizeChange={handleCustomPageSizeChange}
                onCustomPageSizeBlur={handleCustomPageSizeBlur}
                resendUi={resendUi}
                resendErrors={resendErrors}
                onResend={(inv) => void handleResend(inv)}
              />
            )}
          </div>
        )}
      </section>

      <InviteExaminerModal
        open={inviteModalOpen}
        busy={busy}
        error={inviteError}
        name={name}
        phone={phone}
        subjectId={subjectId}
        examinerType={examinerType}
        region={region}
        responseDeadlineInput={responseDeadlineInput}
        coordinationDateInput={coordinationDateInput}
        sendSms={sendSms}
        subjectOptions={inviteSubjectOptions}
        regionOptions={regionOptions}
        onClose={() => {
          if (!busy) {
            setInviteModalOpen(false);
            setInviteError(null);
          }
        }}
        onSubmit={() => void handleInvite()}
        onNameChange={setName}
        onPhoneChange={setPhone}
        onSubjectIdChange={setSubjectId}
        onExaminerTypeChange={setExaminerType}
        onRegionChange={setRegion}
        onResponseDeadlineChange={setResponseDeadlineInput}
        onCoordinationDateChange={setCoordinationDateInput}
        onSendSmsChange={setSendSms}
      />

      <BulkUploadModal
        open={uploadModalOpen}
        busy={busy}
        examId={examId}
        error={uploadError}
        result={uploadResult}
        bulkFile={bulkFile}
        sendSmsOnBulk={sendSmsOnBulk}
        bulkResponseDeadlineInput={bulkResponseDeadlineInput}
        bulkCoordinationDateInput={bulkCoordinationDateInput}
        onClose={() => {
          if (!busy) closeUploadModal();
        }}
        onSubmit={() => void handleBulkUpload()}
        onDownloadTemplate={() => {
          if (examId == null) return;
          void downloadExaminerInvitationsBulkTemplate(examId).catch((err: unknown) => {
            setUploadError(err instanceof Error ? err.message : "Template download failed");
          });
        }}
        onFileChange={(file) => {
          setBulkFile(file);
          setUploadResult(null);
          setUploadError(null);
        }}
        onSendSmsOnBulkChange={setSendSmsOnBulk}
        onBulkResponseDeadlineChange={setBulkResponseDeadlineInput}
        onBulkCoordinationDateChange={setBulkCoordinationDateInput}
      />

      <SetCoordinationDateModal
        open={coordinationModalOpen}
        busy={busy}
        error={coordinationModalError}
        recipientCount={selectedCount}
        coordinationDateInput={batchCoordinationDateInput}
        onClose={() => {
          if (!busy) closeCoordinationModal();
        }}
        onSubmit={() => void handleSetCoordinationDate()}
        onCoordinationDateChange={setBatchCoordinationDateInput}
      />

      <CustomSmsModal
        open={smsModalOpen}
        busy={busy}
        error={smsError}
        result={smsResult}
        message={customSmsMessage}
        recipientCount={smsTargetRows.length}
        recipientLabel={smsRecipientLabel}
        submitBlockedReason={coordinationSmsBlockedReason}
        onClose={() => {
          if (!busy) closeSmsModal();
        }}
        onSubmit={() => void handleBulkSms()}
        onMessageChange={setCustomSmsMessage}
      />
    </>
  );
}
