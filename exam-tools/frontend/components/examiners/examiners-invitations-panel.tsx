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
  ExtendRespondByModal,
  InviteExaminerModal,
  RenewInvitationModal,
  SetCoordinationDateModal,
} from "@/components/examiner-invitations/invitations-modals";
import { InvitationsSummaryStats } from "@/components/examiner-invitations/invitations-summary-stats";
import { InvitationsTable } from "@/components/examiner-invitations/invitations-table";
import { InvitationsMobileList } from "@/components/examiners/invitations-mobile-list";
import { ExaminerPortalLinkRegenerateConfirmModal } from "@/components/examiners/examiner-portal-link-regenerate-confirm-modal";
import { ExaminerAllocationModal } from "@/components/examiner-invitations/examiner-allocation-modal";
import type {
  InvitationStatusCounts,
  InvitationStatusFilter,
  ResendUiState,
} from "@/components/examiner-invitations/types";
import {
  emptyInvitationCoordinationDraft,
  invitationCoordinationToPayload,
  type InvitationCoordinationDraft,
} from "@/components/examiner-invitations/invitation-coordination-schedule-fields";
import {
  clampPageSize,
  defaultDatetimeLocalInput,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  canReceiveCoordinationSms,
  coordinationSmsSelectionBlockedReason,
  matchesSearchQuery,
} from "@/components/examiner-invitations/utils";
import type { OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { Button } from "@/components/ui/button";
import {
  bulkSendExaminerInvitationCustomSms,
  bulkSetExaminerInvitationCoordinationSchedule,
  bulkUploadExaminerInvitations,
  createExaminerInvitation,
  downloadExaminerInvitationLinksExport,
  downloadExaminerInvitationsBulkTemplate,
  listExaminerInvitations,
  regenerateExaminerInvitationLink,
  renewExaminerInvitation,
  resendExaminerInvitationSms,
  updateExaminerInvitationResponseDeadline,
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
import { useSyncPageSubjectScope } from "@/components/examiners/use-sync-page-subject-scope";

const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  examId: number | null;
  subjects: Subject[];
  lockedSubjectIds?: number[];
  embedded?: boolean;
  pageScroll?: boolean;
  readOnly?: boolean;
  onInvitationCountsChange?: (counts: InvitationStatusCounts) => void;
  usePageSubjectScope?: boolean;
  pageSubjectTypeFilter?: ScriptControlSubjectTypeFilter;
  pageSubjectId?: string;
  mobileContactLayout?: boolean;
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

export function ExaminersInvitationsPanel({
  examId,
  subjects,
  lockedSubjectIds,
  embedded = false,
  pageScroll = false,
  readOnly = false,
  onInvitationCountsChange,
  usePageSubjectScope = false,
  pageSubjectTypeFilter = "all",
  pageSubjectId = "",
  mobileContactLayout = false,
}: Props) {
  const [invitations, setInvitations] = useState<ExaminerInvitationRow[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageTone, setActionMessageTone] = useState<"success" | "error">("success");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<ExaminerInvitationRow | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<ExaminerInvitationRow | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewDeadlineInput, setRenewDeadlineInput] = useState("");
  const [renewSendSms, setRenewSendSms] = useState(true);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<ExaminerInvitationRow | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extendDeadlineInput, setExtendDeadlineInput] = useState("");
  const [extendSendSms, setExtendSendSms] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsSingleTarget, setSmsSingleTarget] = useState<ExaminerInvitationRow | null>(null);
  const [coordinationModalOpen, setCoordinationModalOpen] = useState(false);
  const [coordinationModalError, setCoordinationModalError] = useState<string | null>(null);
  const [batchCoordinationDraft, setBatchCoordinationDraft] = useState<InvitationCoordinationDraft>(
    emptyInvitationCoordinationDraft(),
  );
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
  const [gender, setGender] = useState("");
  const [responseDeadlineInput, setResponseDeadlineInput] = useState("");
  const [coordinationDraft, setCoordinationDraft] = useState<InvitationCoordinationDraft>(
    emptyInvitationCoordinationDraft(),
  );
  const [bulkResponseDeadlineInput, setBulkResponseDeadlineInput] = useState("");
  const [bulkCoordinationDraft, setBulkCoordinationDraft] = useState<InvitationCoordinationDraft>(
    emptyInvitationCoordinationDraft(),
  );
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
  const [copyLinkUi, setCopyLinkUi] = useState<Record<string, "copied" | "error">>({});
  const [allocationTarget, setAllocationTarget] = useState<ExaminerInvitationRow | null>(null);

  useSyncPageSubjectScope({
    enabled: usePageSubjectScope,
    pageSubjectTypeFilter,
    pageSubjectId,
    setSubjectTypeFilter,
    setSubjectFilter,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!actionMessage) return;
    const t = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMessage]);

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
    if (smsSingleTarget) return [smsSingleTarget];
    if (selectedCount > 0) {
      return filteredRows.filter((row) => rowSelection[row.id]);
    }
    return filteredRows;
  }, [smsSingleTarget, filteredRows, rowSelection, selectedCount]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (!usePageSubjectScope && subjectTypeFilter !== "all") n += 1;
    if (!usePageSubjectScope) n += subjectFilter.length;
    n += roleFilter.length + regionFilter.length;
    return n;
  }, [roleFilter.length, regionFilter.length, subjectFilter.length, subjectTypeFilter, usePageSubjectScope]);

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
    usePageSubjectScope,
  ]);

  function clearAllFilters() {
    setSearchQuery("");
    setStatusFilter("all");
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

  const openRenew = useCallback((inv: ExaminerInvitationRow) => {
    setRenewTarget(inv);
    setRenewError(null);
    setRenewDeadlineInput(
      isoToDatetimeLocal(inv.response_deadline) || defaultDatetimeLocalInput(),
    );
    setRenewSendSms(true);
    setRenewModalOpen(true);
  }, []);

  const closeRenewModal = useCallback(() => {
    setRenewModalOpen(false);
    setRenewTarget(null);
    setRenewError(null);
    setRenewDeadlineInput("");
  }, []);

  const openExtend = useCallback((inv: ExaminerInvitationRow) => {
    setExtendTarget(inv);
    setExtendError(null);
    setExtendDeadlineInput(
      isoToDatetimeLocal(inv.response_deadline) || defaultDatetimeLocalInput(),
    );
    setExtendSendSms(false);
    setExtendModalOpen(true);
  }, []);

  const closeExtendModal = useCallback(() => {
    setExtendModalOpen(false);
    setExtendTarget(null);
    setExtendError(null);
    setExtendDeadlineInput("");
  }, []);

  const handleExtend = useCallback(async () => {
    if (examId == null || extendTarget == null) return;
    if (!extendDeadlineInput.trim()) {
      setExtendError("Respond-by deadline is required.");
      return;
    }
    const responseDeadlineIso = datetimeLocalToIso(extendDeadlineInput);
    if (!responseDeadlineIso) {
      setExtendError("Enter a valid respond-by date and time.");
      return;
    }
    setExtendError(null);
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await updateExaminerInvitationResponseDeadline(examId, extendTarget.id, {
        response_deadline: responseDeadlineIso,
        send_sms: extendSendSms,
      });
      closeExtendModal();
      setActionMessageTone("success");
      if (res.sms_sent === true) {
        setActionMessage(`Respond-by extended and SMS sent to ${extendTarget.name}.`);
      } else if (res.sms_sent === false) {
        setActionMessageTone("error");
        setActionMessage(
          `Respond-by extended for ${extendTarget.name}, but SMS failed: ${res.sms_error ?? "Unknown error"}`,
        );
      } else {
        setActionMessage(`Respond-by extended for ${extendTarget.name}.`);
      }
      await loadInvitations(examId);
    } catch (e) {
      setExtendError(e instanceof Error ? e.message : "Failed to extend respond-by");
    } finally {
      setBusy(false);
    }
  }, [
    closeExtendModal,
    examId,
    extendDeadlineInput,
    extendSendSms,
    extendTarget,
    loadInvitations,
  ]);

  const handleRenew = useCallback(async () => {
    if (examId == null || renewTarget == null) return;
    if (!renewDeadlineInput.trim()) {
      setRenewError("Respond-by deadline is required.");
      return;
    }
    const responseDeadlineIso = datetimeLocalToIso(renewDeadlineInput);
    if (!responseDeadlineIso) {
      setRenewError("Enter a valid respond-by date and time.");
      return;
    }
    setRenewError(null);
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await renewExaminerInvitation(examId, renewTarget.id, {
        response_deadline: responseDeadlineIso,
        send_sms: renewSendSms,
      });
      closeRenewModal();
      const actionVerb = renewTarget.status === "declined" ? "reopened" : "renewed";
      setActionMessageTone("success");
      if (res.sms_sent === true) {
        setActionMessage(`Invitation ${actionVerb} and SMS sent to ${renewTarget.name}.`);
      } else if (res.sms_sent === false) {
        setActionMessageTone("error");
        setActionMessage(
          `Invitation ${actionVerb} for ${renewTarget.name}, but SMS failed: ${res.sms_error ?? "Unknown error"}`,
        );
      } else {
        setActionMessage(`Invitation ${actionVerb} for ${renewTarget.name}.`);
      }
      await loadInvitations(examId);
    } catch (e) {
      setRenewError(e instanceof Error ? e.message : "Renew failed");
    } finally {
      setBusy(false);
    }
  }, [
    closeRenewModal,
    examId,
    loadInvitations,
    renewDeadlineInput,
    renewSendSms,
    renewTarget,
  ]);

  const openRegenerateLink = useCallback((inv: ExaminerInvitationRow) => {
    setRegenerateTarget(inv);
  }, []);

  const handleRegenerateLink = useCallback(
    async ({ sendSms }: { sendSms: boolean }) => {
      if (examId == null || regenerateTarget == null) return;
      const targetName = regenerateTarget.name;
      setBusy(true);
      setActionMessage(null);
      try {
        const res = await regenerateExaminerInvitationLink(examId, regenerateTarget.id, {
          sendSms,
        });
        setInvitations((prev) =>
          prev.map((row) => (row.id === regenerateTarget.id ? res.invitation : row)),
        );
        setRegenerateTarget(null);
        setActionMessageTone("success");
        try {
          await navigator.clipboard.writeText(res.public_url);
          if (res.sms_sent === true) {
            setActionMessage(
              `New link generated for ${targetName}, copied to clipboard, and sent by SMS.`,
            );
          } else if (res.sms_sent === false) {
            setActionMessageTone("error");
            setActionMessage(
              `New link generated for ${targetName}, but SMS failed: ${res.sms_error ?? "Unknown error"}`,
            );
          } else {
            setActionMessage(`New link generated for ${targetName} and copied to clipboard.`);
          }
        } catch {
          setActionMessage(`New link generated for ${targetName}: ${res.public_url}`);
        }
      } catch (e) {
        setActionMessageTone("error");
        setActionMessage(e instanceof Error ? e.message : "Could not generate a new link");
      } finally {
        setBusy(false);
      }
    },
    [examId, regenerateTarget],
  );

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

  const handleCopyLink = useCallback(async (inv: ExaminerInvitationRow) => {
    if (!inv.public_url) {
      setCopyLinkUi((prev) => ({ ...prev, [inv.id]: "error" }));
      return;
    }
    try {
      await navigator.clipboard.writeText(inv.public_url);
      setCopyLinkUi((prev) => ({ ...prev, [inv.id]: "copied" }));
      window.setTimeout(() => {
        setCopyLinkUi((prev) => {
          if (prev[inv.id] !== "copied") return prev;
          const next = { ...prev };
          delete next[inv.id];
          return next;
        });
      }, 2500);
    } catch {
      setCopyLinkUi((prev) => ({ ...prev, [inv.id]: "error" }));
    }
  }, []);

  const handleDownloadLinks = useCallback(async () => {
    if (examId == null) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const subjectId =
        subjectFilter.length === 1 ? Number(subjectFilter[0]) : undefined;
      await downloadExaminerInvitationLinksExport(examId, subjectId);
      setActionMessageTone("success");
      setActionMessage("Examiner links downloaded.");
    } catch (e) {
      setActionMessageTone("error");
      setActionMessage(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }, [examId, subjectFilter]);

  function resetInviteForm() {
    setName("");
    setPhone("");
    setSubjectId("");
    setRegion("");
    setGender("");
    setExaminerType("assistant_examiner");
    setSendSms(true);
    setResponseDeadlineInput("");
    setCoordinationDraft(emptyInvitationCoordinationDraft());
  }

  function closeUploadModal() {
    setUploadModalOpen(false);
    setUploadError(null);
    setUploadResult(null);
    setSendSmsOnBulk(false);
    setBulkFile(null);
    setBulkResponseDeadlineInput("");
    setBulkCoordinationDraft(emptyInvitationCoordinationDraft());
  }

  function closeSmsModal() {
    setSmsModalOpen(false);
    setSmsSingleTarget(null);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
  }

  function openCustomSmsForInvitation(row: ExaminerInvitationRow) {
    setSmsSingleTarget(row);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
    setSmsModalOpen(true);
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
        gender: gender.trim() || null,
        send_sms: sendSms,
        response_deadline: responseDeadlineIso,
        ...invitationCoordinationToPayload(coordinationDraft),
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
        coordinationStartDate: invitationCoordinationToPayload(bulkCoordinationDraft).coordination_start_date,
        coordinationStartTime: invitationCoordinationToPayload(bulkCoordinationDraft).coordination_start_time,
        coordinationEndDate: invitationCoordinationToPayload(bulkCoordinationDraft).coordination_end_date,
        coordinationEndTime: invitationCoordinationToPayload(bulkCoordinationDraft).coordination_end_time,
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
    setBatchCoordinationDraft(emptyInvitationCoordinationDraft());
  }

  async function handleSetCoordinationDate() {
    if (examId == null || selectedCount === 0) return;
    if (!batchCoordinationDraft.startDate.trim() && !batchCoordinationDraft.endDate.trim()) {
      setCoordinationModalError("Enter at least a coordination start or end date.");
      return;
    }
    const invitationIds = filteredRows.filter((row) => rowSelection[row.id]).map((row) => row.id);
    setBusy(true);
    setCoordinationModalError(null);
    try {
      const res = await bulkSetExaminerInvitationCoordinationSchedule(examId, {
        invitation_ids: invitationIds,
        ...invitationCoordinationToPayload(batchCoordinationDraft),
      });
      await loadInvitations(examId);
      closeCoordinationModal();
      setActionMessageTone(res.errors.length ? "error" : "success");
      if (res.errors.length) {
        setActionMessage(
          `Updated ${res.updated_count} invitation(s). ${res.errors.length} could not be updated.`,
        );
      } else {
        setActionMessage(`Coordination schedule set for ${res.updated_count} invitation(s).`);
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
            `Coordination schedule saved. SMS wasn't opened because no one in your selection has accepted yet.`,
          );
        }
      }
    } catch (e) {
      setCoordinationModalError(e instanceof Error ? e.message : "Could not save coordination date");
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
        : "all invitations";

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

  return (
    <>
      {loadError ? (
        <p className="mx-3 mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-4">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p
          className={cn(
            "mx-3 mt-2 rounded-lg px-3 py-2 text-sm sm:mx-4",
            actionMessageTone === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border border-destructive/40 bg-destructive/10 text-destructive",
          )}
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
              : INVITATIONS_PANEL_CLASS,
          !embedded && "flex min-h-0 flex-1 flex-col",
        )}
      >
        <InvitationsCommandBar
          examId={examId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchDisabled={examId == null}
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
            setSmsSingleTarget(null);
            setSmsError(null);
            setSmsResult(null);
            setCustomSmsMessage("");
            setSmsModalOpen(true);
          }}
          onSetCoordinationDate={() => {
            setCoordinationModalError(null);
            setBatchCoordinationDraft(emptyInvitationCoordinationDraft());
            setCoordinationModalOpen(true);
          }}
          onBulkUpload={() => {
            setUploadError(null);
            setUploadResult(null);
            setUploadModalOpen(true);
          }}
          onInvite={() => {
            setInviteError(null);
            setResponseDeadlineInput(defaultDatetimeLocalInput());
            setInviteModalOpen(true);
          }}
          onDownloadLinks={() => void handleDownloadLinks()}
          busy={busy || loadingInvitations}
          disabled={examId == null}
          readOnly={readOnly}
          hideSubjectScopeFilters={usePageSubjectScope}
          mobileContactLayout={mobileContactLayout}
        />

        <div className={pageScroll ? "flex flex-col" : "flex min-h-0 flex-1 flex-col"}>
            <div className="space-y-2 px-2 pt-2 sm:px-3">
              <InvitationsSummaryStats
                counts={statusCounts}
                activeStatus={statusFilter}
                onStatusClick={setStatusFilter}
              />
            </div>

            <div
              className={cn(
                pageScroll ? "flex flex-col gap-2 p-2 sm:p-3" : "flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3",
              )}
            >
            {selectedCount > 0 ? (
              <p className="text-sm text-muted-foreground">{selectedCount} selected</p>
            ) : null}

            {!loadingInvitations && invitations.length === 0 ? (
              <div className="flex min-h-[14rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No invitations yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {readOnly
                      ? "Invitations will appear here once administrators send them. You can still notify examiners via SMS."
                      : "Send individual invitations or upload a spreadsheet to invite examiners for this examination."}
                  </p>
                </div>
                {readOnly ? null : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => {
                        setInviteError(null);
                        setResponseDeadlineInput(defaultDatetimeLocalInput());
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
                )}
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
              <>
                <div className={mobileContactLayout ? "hidden md:block" : undefined}>
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
                    onRenew={openRenew}
                    onExtendDeadline={openExtend}
                    onRegenerateLink={openRegenerateLink}
                    onCopyLink={(inv) => void handleCopyLink(inv)}
                    copyLinkUi={copyLinkUi}
                    onViewAllocation={
                      lockedSubjectIds != null
                        ? (inv) => setAllocationTarget(inv)
                        : undefined
                    }
                    pageScroll={pageScroll}
                  />
                </div>
                {mobileContactLayout && !loadingInvitations && filteredRows.length > 0 ? (
                  <InvitationsMobileList
                    rows={filteredRows}
                    pagination={pagination}
                    onPaginationChange={setPagination}
                    showCustomPageSizeInput={customPageSizeEditing}
                    customPageSizeInput={customPageSizeInput}
                    onPageSizeSelectChange={handlePageSizeSelectChange}
                    onCustomPageSizeChange={handleCustomPageSizeChange}
                    onCustomPageSizeBlur={handleCustomPageSizeBlur}
                    busy={busy || loadingInvitations}
                    resendUi={resendUi}
                    resendErrors={resendErrors}
                    onInAppSms={openCustomSmsForInvitation}
                    onResend={(inv) => void handleResend(inv)}
                    onRenew={openRenew}
                    onExtendDeadline={openExtend}
                    onRegenerateLink={openRegenerateLink}
                    onCopyLink={(inv) => void handleCopyLink(inv)}
                    copyLinkUi={copyLinkUi}
                    onViewAllocation={
                      lockedSubjectIds != null
                        ? (inv) => setAllocationTarget(inv)
                        : undefined
                    }
                  />
                ) : null}
              </>
            )}
            </div>
          </div>
      </section>

      {regenerateTarget ? (
        <ExaminerPortalLinkRegenerateConfirmModal
          subjectName={regenerateTarget.name}
          showSendSmsOption
          busy={busy}
          onCancel={() => {
            if (!busy) setRegenerateTarget(null);
          }}
          onConfirm={(options) => void handleRegenerateLink(options)}
        />
      ) : null}

      <RenewInvitationModal
        open={renewModalOpen}
        busy={busy}
        error={renewError}
        status={renewTarget?.status ?? null}
        name={renewTarget?.name ?? ""}
        phone={renewTarget?.phone_number ?? ""}
        responseDeadlineInput={renewDeadlineInput}
        sendSms={renewSendSms}
        onClose={() => {
          if (!busy) closeRenewModal();
        }}
        onSubmit={() => void handleRenew()}
        onResponseDeadlineChange={setRenewDeadlineInput}
        onSendSmsChange={setRenewSendSms}
      />

      <ExtendRespondByModal
        open={extendModalOpen}
        busy={busy}
        error={extendError}
        status={extendTarget?.status ?? null}
        name={extendTarget?.name ?? ""}
        phone={extendTarget?.phone_number ?? ""}
        responseDeadlineInput={extendDeadlineInput}
        sendSms={extendSendSms}
        onClose={() => {
          if (!busy) closeExtendModal();
        }}
        onSubmit={() => void handleExtend()}
        onResponseDeadlineChange={setExtendDeadlineInput}
        onSendSmsChange={setExtendSendSms}
      />

      <InviteExaminerModal
        open={inviteModalOpen}
        busy={busy}
        error={inviteError}
        name={name}
        phone={phone}
        subjectId={subjectId}
        examinerType={examinerType}
        region={region}
        gender={gender}
        responseDeadlineInput={responseDeadlineInput}
        coordinationDraft={coordinationDraft}
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
        onGenderChange={setGender}
        onResponseDeadlineChange={setResponseDeadlineInput}
        onCoordinationDraftChange={setCoordinationDraft}
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
        bulkCoordinationDraft={bulkCoordinationDraft}
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
        onBulkCoordinationDraftChange={setBulkCoordinationDraft}
      />

      <SetCoordinationDateModal
        open={coordinationModalOpen}
        busy={busy}
        error={coordinationModalError}
        recipientCount={selectedCount}
        coordinationDraft={batchCoordinationDraft}
        onClose={() => {
          if (!busy) closeCoordinationModal();
        }}
        onSubmit={() => void handleSetCoordinationDate()}
        onCoordinationDraftChange={setBatchCoordinationDraft}
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

      <ExaminerAllocationModal
        open={allocationTarget != null}
        onClose={() => setAllocationTarget(null)}
        examinationId={examId}
        subjectId={allocationTarget?.subject_id ?? null}
        examinerId={allocationTarget?.examiner_id ?? null}
        examinerName={allocationTarget?.name ?? ""}
      />
    </>
  );
}
