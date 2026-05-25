"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { TypeToDeleteConfirmModal } from "@/components/type-to-delete-confirm-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  createExamOfficial,
  deleteExamOfficial,
  downloadExamOfficialsSummaryPdf,
  displayBankCode,
  getDistinctBankNames,
  getExamOfficialsForMyCentre,
  getInspectorSubmissionStatus,
  inspectorOfficialsSubmissionNotice,
  isInspectorScopePeriodOpen,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  listBankBranches,
  updateExamOfficial,
  type BankBranchRow,
  type Examination,
  type ExamOfficialDesignation,
  type ExamCentreOfficialResponse,
  type ExamCentreOfficialCreatePayload,
  type InspectorSubmissionStatus,
  type MyInspectorPostingRow,
  type RecordSubjectScope,
} from "@/lib/api";
import {
  OfficialAccountsExamMeta,
  OfficialAccountsPageIntro,
} from "@/components/official-accounts-page-intro";
import { OfficialAccountsPanelHeader } from "@/components/official-accounts-panel-header";
import { inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";
import {
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import {
  accountInputMaxLengthForEdit,
  accountValidationMessage,
  getAccountFieldCopy,
  isValidAccountInput,
  resolveBankKind,
  splitAbsaAccountForDisplay,
} from "@/lib/exam-official-account";

const btnPrimary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDanger =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30 sm:min-h-10 sm:w-auto";

const DESIGNATIONS: ExamOfficialDesignation[] = [
  "Depot Keeper",
  "Supervisor",
  "Assistant Supervisor",
  "Invigilator",
  "Police Officer",
  "External Inspector",
];

const GHANA_PHONE_RE = /^0(2[0-9]|5[0-9]|9[0-9])[0-9]{7}$/;
const PHONE_HINT = "Enter a 10-digit phone number (e.g. 0241234567).";

function truncateLabel(s: string, max = 28): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatMobileBankLine(row: ExamCentreOfficialResponse, max = 52): string {
  const line = `${row.bank_name.trim()} · ${row.branch_name.trim()} (${displayBankCode(row.bank_code)})`;
  return truncateLabel(line, max);
}

function maskAccountNumber(n: string): string {
  const t = n.trim();
  if (t.length <= 4) return t;
  return `•••••••${t.slice(-4)}`;
}

function summaryPdfFilename(centerCode: string, centerName: string, scope: RecordSubjectScope): string {
  const part = (s: string) => {
    const t = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
    return (t || "unknown").slice(0, 80);
  };
  return `${part(centerCode)} ${part(centerName)} ${scope} official_accounts_summary.pdf`;
}

function preventClipboardInsert(e: React.ClipboardEvent | React.DragEvent) {
  e.preventDefault();
}

function OfficialModal({
  title,
  subtitle,
  titleId,
  subtitleId,
  onClose,
  children,
  footer,
  formError,
  scrollRef,
  focusNameOnMount = true,
}: {
  title: string;
  subtitle?: string | null;
  titleId: string;
  subtitleId?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  formError?: string | null;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  focusNameOnMount?: boolean;
}) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!focusNameOnMount) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById("eo-name");
      if (el && typeof el.focus === "function") el.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [focusNameOnMount]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      if (!vv) return;
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const sheet = (
    <>
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className="relative z-10 flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg max-sm:max-h-[min(90dvh,90svh)] sm:max-h-[min(90vh,920px)] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="shrink-0 border-b border-border">
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35 sm:hidden"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-4 px-4 pb-4 pt-3 sm:px-5 sm:pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p id={subtitleId} className="mt-1 text-sm text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden shrink-0 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 sm:inline"
          >
            Close
          </button>
        </div>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        >
          {formError ? (
            <p
              role="alert"
              className="sticky top-0 z-10 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm"
            >
              {formError}
            </p>
          ) : null}
          {children}
        </div>
        <div
          className="shrink-0 border-t border-border bg-card px-4 pt-3 sm:px-5"
          style={{
            paddingBottom: `max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
          }}
        >
          {footer}
        </div>
      </div>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">{sheet}</div>,
    document.body,
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 border-0 p-0 md:col-span-2">
      <legend className="text-sm font-semibold text-foreground">{title}</legend>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-4 md:space-y-0">{children}</div>
    </fieldset>
  );
}

export default function InspectorExamOfficialsPage() {
  const FORM_ID = "exam-official-form";
  const router = useRouter();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [workingScope, setWorkingScope] = useState<RecordSubjectScope>("CORE");
  const [submissionStatus, setSubmissionStatus] = useState<InspectorSubmissionStatus | null>(null);
  const [items, setItems] = useState<ExamCentreOfficialResponse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExamCentreOfficialResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState<ExamOfficialDesignation>("Invigilator");
  const [telephone, setTelephone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountConfirm, setAccountConfirm] = useState("");
  const [numDays, setNumDays] = useState("");
  const [numDaysConfirm, setNumDaysConfirm] = useState("");

  const [bankNameQuery, setBankNameQuery] = useState("");
  const [bankNameSuggestions, setBankNameSuggestions] = useState<string[]>([]);
  const [selectedBankName, setSelectedBankName] = useState("");
  const [branchRows, setBranchRows] = useState<BankBranchRow[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const [pendingDelete, setPendingDelete] = useState<ExamCentreOfficialResponse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** Edit modal: sensitive sections collapsed until user expands */
  const [editBankOpen, setEditBankOpen] = useState(true);
  const [editAccountOpen, setEditAccountOpen] = useState(true);
  const [editDaysOpen, setEditDaysOpen] = useState(true);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  /** Desktop table: which row’s ⋮ actions menu is open */
  const [desktopActionsMenuRowId, setDesktopActionsMenuRowId] = useState<string | null>(null);

  const selectedPosting = useMemo(
    () => postings.find((p) => p.id === selectedPostingId) ?? null,
    [postings, selectedPostingId],
  );
  const postingIsAll = selectedPosting?.subject_scope === "ALL";
  const scopePeriodOpen = isInspectorScopePeriodOpen(submissionStatus, workingScope);
  const scopeMutationsEnabled = scopePeriodOpen;
  const submissionNotice = useMemo(
    () => (submissionStatus ? inspectorOfficialsSubmissionNotice(submissionStatus, workingScope) : null),
    [submissionStatus, workingScope],
  );
  const scopeAddEnabled =
    scopePeriodOpen &&
    (workingScope === "CORE"
      ? submissionStatus?.officials_core_enabled
      : submissionStatus?.officials_elective_enabled);

  const loadList = useCallback(async () => {
    if (examId === null) return;
    if (postings.length > 0 && !selectedPostingId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const [res, status] = await Promise.all([
        getExamOfficialsForMyCentre(
          examId,
          postings.length > 0 ? selectedPostingId : undefined,
          postingIsAll ? workingScope : undefined,
        ),
        getInspectorSubmissionStatus(examId),
      ]);
      setItems(res.items);
      setSubmissionStatus(status);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load exam officials");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [examId, postings.length, selectedPostingId, postingIsAll, workingScope]);

  useEffect(() => {
    if (inspectorMustPickWorkspaceGlobally(postings.length)) {
      router.replace("/dashboard/inspector/select-workspace");
    }
  }, [postings.length, router]);

  useEffect(() => {
    async function boot() {
      setLoadError(null);
      try {
        const ex = await getStaffDefaultExamination();
        setExams([ex]);
        setExamId(ex.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load active examination");
      }
    }
    void boot();
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (examId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const postingRes = await getMyInspectorPostings(examId);
        if (cancelled) return;
        setPostings(postingRes.items);
        setSelectedPostingId((prev) => {
          const pid = pickInspectorPostingId(postingRes.items, prev);
          const posting = postingRes.items.find((p) => p.id === pid);
          if (posting?.subject_scope === "CORE") setWorkingScope("CORE");
          else if (posting?.subject_scope === "ELECTIVE") setWorkingScope("ELECTIVE");
          return pid;
        });
      } catch {
        if (!cancelled) {
          setPostings([]);
          setSelectedPostingId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    setDesktopActionsMenuRowId(null);
  }, [examId, selectedPostingId]);

  useEffect(() => {
    if (!modalOpen) return;
    scrollModalToTop();
  }, [modalOpen, editing?.id]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!bankNameQuery.trim()) {
        setBankNameSuggestions([]);
        return;
      }
      void (async () => {
        try {
          const names = await getDistinctBankNames(bankNameQuery.trim());
          setBankNameSuggestions(names);
        } catch {
          setBankNameSuggestions([]);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [bankNameQuery]);

  useEffect(() => {
    if (!selectedBankName.trim()) {
      setBranchRows([]);
      setSelectedBranchId("");
      setBranchesLoading(false);
      return;
    }
    let cancelled = false;
    setBranchesLoading(true);
    void (async () => {
      try {
        const res = await listBankBranches({
          bank_name_exact: selectedBankName.trim(),
          limit: 500,
        });
        if (!cancelled) setBranchRows(res.items);
      } catch {
        if (!cancelled) setBranchRows([]);
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBankName]);

  function scrollModalToTop() {
    requestAnimationFrame(() => {
      modalScrollRef.current?.scrollTo(0, 0);
    });
  }

  function openAdd() {
    setEditing(null);
    setEditBankOpen(true);
    setEditAccountOpen(true);
    setEditDaysOpen(true);
    setFullName("");
    setDesignation("Invigilator");
    setTelephone("");
    setAccountNumber("");
    setAccountConfirm("");
    setNumDays("");
    setNumDaysConfirm("");
    setBankNameQuery("");
    setBankNameSuggestions([]);
    setSelectedBankName("");
    setBranchRows([]);
    setBranchesLoading(false);
    setSelectedBranchId("");
    setFormError(null);
    setModalOpen(true);
    scrollModalToTop();
  }

  function openEdit(row: ExamCentreOfficialResponse) {
    if (!scopeMutationsEnabled) return;
    setDesktopActionsMenuRowId(null);
    setEditing(row);
    setEditBankOpen(false);
    setEditAccountOpen(false);
    setEditDaysOpen(false);
    setFullName(row.full_name);
    setDesignation(row.designation);
    setTelephone(row.telephone_number);
    const acctDisplay =
      resolveBankKind(row.bank_name) === "absa"
        ? splitAbsaAccountForDisplay(row.account_number, row.bank_code)
        : row.account_number;
    setAccountNumber(acctDisplay);
    setAccountConfirm(acctDisplay);
    setNumDays(String(row.num_days));
    setNumDaysConfirm(String(row.num_days));
    setSelectedBankName(row.bank_name);
    setBankNameQuery(row.bank_name);
    setSelectedBranchId(row.bank_branch_id);
    setBranchRows([]);
    setBranchesLoading(true);
    setFormError(null);
    setModalOpen(true);
    scrollModalToTop();
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (examId === null) return;
    if (postings.length > 0 && !selectedPostingId) {
      setFormError("Choose a workspace (centre and subject scope) first.");
      return;
    }
    if (editing && !scopeMutationsEnabled) {
      setFormError("Submissions are closed — existing records cannot be edited.");
      return;
    }
    setFormError(null);

    if (!selectedBranchId.trim()) {
      setFormError("Select a bank and branch.");
      return;
    }
    if (
      !isValidAccountInput(accountNumber, selectedBankName, {
        forUpdate: Boolean(editing),
      })
    ) {
      setFormError(accountValidationMessage(selectedBankName, Boolean(editing)));
      return;
    }
    if (accountNumber.trim() !== accountConfirm.trim()) {
      setFormError("Account number and confirmation do not match.");
      return;
    }
    const days = parseInt(numDays.trim(), 10);
    const daysC = parseInt(numDaysConfirm.trim(), 10);
    if (Number.isNaN(days) || days < 1) {
      setFormError("Number of days must be at least 1.");
      return;
    }
    if (days !== daysC) {
      setFormError("Number of days and confirmation do not match.");
      return;
    }
    const phone = telephone.trim();
    if (!GHANA_PHONE_RE.test(phone)) {
      setFormError("Enter a valid 10-digit phone number.");
      return;
    }

    const payload: ExamCentreOfficialCreatePayload = {
      full_name: fullName.trim(),
      designation,
      bank_branch_id: selectedBranchId.trim(),
      account_number: accountNumber.trim(),
      num_days: days,
      telephone_number: phone,
    };

    const postingParam = postings.length > 0 ? selectedPostingId : undefined;
    const scopeParam = postingIsAll ? workingScope : undefined;
    setBusy(true);
    try {
      if (editing) {
        await updateExamOfficial(
          examId,
          editing.id,
          {
            full_name: payload.full_name,
            designation: payload.designation,
            bank_branch_id: payload.bank_branch_id,
            account_number: payload.account_number,
            num_days: payload.num_days,
            telephone_number: payload.telephone_number,
          },
          postingParam,
          scopeParam,
        );
      } else {
        await createExamOfficial(examId, payload, postingParam, scopeParam);
      }
      closeModal();
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const summaryPdfEnabled =
    examId !== null &&
    items.length > 0 &&
    !(postings.length > 0 && !selectedPostingId) &&
    !busy &&
    !pdfDownloadBusy;

  async function handleDownloadSummaryPdf() {
    if (examId === null || !summaryPdfEnabled) return;
    setLoadError(null);
    setPdfDownloadBusy(true);
    try {
      const scopeForPdf: RecordSubjectScope = postingIsAll
        ? workingScope
        : selectedPosting?.subject_scope === "ELECTIVE"
          ? "ELECTIVE"
          : "CORE";
      const filename =
        selectedPosting != null
          ? summaryPdfFilename(selectedPosting.center_code, selectedPosting.center_name, scopeForPdf)
          : undefined;
      await downloadExamOfficialsSummaryPdf(
        examId,
        postings.length > 0 ? selectedPostingId : undefined,
        postingIsAll ? workingScope : undefined,
        filename,
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to download summary PDF");
    } finally {
      setPdfDownloadBusy(false);
    }
  }

  async function confirmDelete() {
    if (examId === null || pendingDelete === null || !scopeMutationsEnabled) return;
    if (postings.length > 0 && !selectedPostingId) return;
    setDeleteBusy(true);
    try {
      await deleteExamOfficial(
        examId,
        pendingDelete.id,
        postings.length > 0 ? selectedPostingId : undefined,
        postingIsAll ? workingScope : undefined,
      );
      setPendingDelete(null);
      setDesktopActionsMenuRowId(null);
      await loadList();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  const accountFieldCopy = getAccountFieldCopy(selectedBankName, Boolean(editing));
  const accountMaxLen = editing
    ? accountInputMaxLengthForEdit(selectedBankName)
    : accountFieldCopy.targetLen;

  const acctLen = accountNumber.replace(/\D/g, "").length;
  const acctConfirmLen = accountConfirm.replace(/\D/g, "").length;
  const acctValid = isValidAccountInput(accountNumber, selectedBankName, {
    forUpdate: Boolean(editing),
  });
  const acctMatch =
    acctValid &&
    accountNumber.trim() === accountConfirm.trim() &&
    accountConfirm.trim().length > 0;

  const daysN = parseInt(numDays.trim(), 10);
  const daysCN = parseInt(numDaysConfirm.trim(), 10);
  const daysValid = !Number.isNaN(daysN) && daysN >= 1;
  const daysMatch = daysValid && !Number.isNaN(daysCN) && daysN === daysCN && numDays.trim() !== "" && numDaysConfirm.trim() !== "";

  const phoneOk = telephone.trim().length > 0 && GHANA_PHONE_RE.test(telephone.trim());

  const branchSelectHint = !selectedBankName.trim()
    ? "Choose a bank name first."
    : branchesLoading
      ? "Loading branches…"
      : branchRows.length === 0
        ? "No branches found for this bank name."
        : "Select branch…";

  const bankComboboxOptions = useMemo(
    () => bankNameSuggestions.map((n) => ({ value: n, label: n })),
    [bankNameSuggestions],
  );

  const branchComboboxOptions = useMemo(
    () =>
      branchRows.map((b) => ({
        value: b.id,
        label: `${b.branch_name} (${displayBankCode(b.bank_code)})`,
      })),
    [branchRows],
  );

  const selectedBranchLabel =
    branchComboboxOptions.find((o) => o.value === selectedBranchId)?.label ??
    (editing ? `${editing.branch_name} (${displayBankCode(editing.bank_code)})` : "");

  const modalSubtitle = editing ? `Editing · ${editing.full_name} · ${editing.designation}` : null;

  const showBankFields = !editing || editBankOpen;
  const showAccountFields = !editing || editAccountOpen;
  const showDaysFields = !editing || editDaysOpen;

  const accountActionButtons = (
    <>
      <button
        type="button"
        className={`${officialAccountsBtnSecondary} min-h-11 w-full`}
        onClick={() => void handleDownloadSummaryPdf()}
        disabled={!summaryPdfEnabled}
        title={items.length === 0 ? "Add at least one account record to download the summary" : undefined}
      >
        {pdfDownloadBusy ? "Preparing PDF…" : "Download summary (PDF)"}
      </button>
      <button
        type="button"
        className={`${officialAccountsBtnPrimary} min-h-11 w-full`}
        onClick={openAdd}
        disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId) || !scopeAddEnabled}
      >
        Add account record
      </button>
    </>
  );

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Official account details" staffRole="inspector">
        <div className="space-y-6">
          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {/* Mobile: fixed below dashboard navbar; page content scrolls underneath */}
          <div className="lg:hidden">
            <div
              className="fixed inset-x-0 top-(--staff-sticky-header-offset) z-20 flex flex-col gap-2 border-b border-border bg-background px-4 py-2.5 shadow-sm sm:px-6"
              aria-label="Account actions"
            >
              {accountActionButtons}
            </div>
            <div className="h-[calc(2*2.75rem+0.5rem+1.25rem+1px)] shrink-0" aria-hidden />
          </div>

          <OfficialAccountsPageIntro
            description="Record bank details for supervisors, assistant supervisors, invigilators, and depot keepers at your centre so allowances can be processed."
            meta={
              examId != null && exams[0] ? (
                <OfficialAccountsExamMeta>
                  {exams[0].year}
                  {exams[0].exam_series ? ` ${exams[0].exam_series}` : ""} — {exams[0].exam_type}
                </OfficialAccountsExamMeta>
              ) : null
            }
            actions={<div className="hidden lg:contents">{accountActionButtons}</div>}
          />

          {submissionNotice ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
              {submissionNotice}
            </p>
          ) : null}

          {postingIsAll ? (
            <div className="flex gap-2">
              {(["CORE", "ELECTIVE"] as RecordSubjectScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    workingScope === scope
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input-border bg-background text-foreground"
                  }`}
                  onClick={() => setWorkingScope(scope)}
                >
                  {scope === "CORE" ? "Core" : "Elective"}
                </button>
              ))}
            </div>
          ) : null}

          <div className={officialAccountsPanelClass}>
            <OfficialAccountsPanelHeader count={items.length} busy={busy} />

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {busy && items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-muted-foreground">Loading account records…</p>
              </div>
            ) : null}
            {!busy && items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No account records yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add each official who should receive an allowance for this examination.
                </p>
                <button
                  type="button"
                  className={`${officialAccountsBtnPrimary} mx-auto mt-5 w-full max-w-xs`}
                  onClick={openAdd}
                  disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId) || !scopeAddEnabled}
                >
                  Add first account record
                </button>
              </div>
            ) : null}
            {items.map((row, index) => {
              const rowNum = index + 1;
              return (
              <article key={row.id} className="bg-card">
                <div className="min-w-0 px-3 py-3">
                  <header className="flex items-start gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 text-xs font-semibold tabular-nums text-muted-foreground"
                      aria-hidden
                    >
                      {rowNum}
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-ring/30"
                      onClick={() => scopeMutationsEnabled && openEdit(row)}
                      disabled={busy || !scopeMutationsEnabled}
                      aria-label={`Edit ${row.full_name}, ${row.designation}`}
                    >
                      <p className="truncate text-sm font-semibold leading-snug text-foreground">
                        <span>{row.full_name}</span>
                        <span className="font-normal text-muted-foreground"> · </span>
                        <span className="inline-flex max-w-[9rem] align-bottom rounded-md bg-success/12 px-1.5 py-px text-xs font-medium text-success sm:max-w-none">
                          {row.designation}
                        </span>
                      </p>
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={`${row.bank_name} · ${row.branch_name} (${displayBankCode(row.bank_code)})`}
                      >
                        {formatMobileBankLine(row)}
                      </p>
                    </button>
                  </header>

                  <p className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <span className="flex min-w-0 max-w-full items-baseline gap-1">
                      <span className="shrink-0 font-medium text-muted-foreground">Acct</span>
                      <span
                        className="min-w-0 truncate font-mono tabular-nums text-foreground"
                        title={row.account_number}
                      >
                        {row.account_number}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1">
                      <span className="font-medium text-muted-foreground">Days</span>
                      <span className="font-medium tabular-nums text-foreground">{row.num_days}</span>
                    </span>
                    <span className="flex min-w-0 max-w-full items-baseline gap-1">
                      <span className="shrink-0 font-medium text-muted-foreground">Tel</span>
                      <span
                        className="min-w-0 truncate tabular-nums text-foreground"
                        title={row.telephone_number}
                      >
                        {row.telephone_number}
                      </span>
                    </span>
                  </p>

                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      className={`${officialAccountsBtnSecondary} min-h-11 flex-1`}
                      onClick={() => scopeMutationsEnabled && openEdit(row)}
                      disabled={busy || !scopeMutationsEnabled}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${btnDanger} min-h-11 flex-1 border-0 bg-transparent px-3 hover:bg-destructive/10`}
                      onClick={() => scopeMutationsEnabled && setPendingDelete(row)}
                      disabled={busy || !scopeMutationsEnabled}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden border-t border-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th
                        colSpan={3}
                        className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Official
                      </th>
                      <th
                        colSpan={4}
                        className="border-l border-border/60 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Bank account
                      </th>
                      <th
                        colSpan={3}
                        className="border-l border-border/60 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Contact & duty
                      </th>
                    </tr>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="w-11 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Name
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Designation
                      </th>
                      <th className="max-w-40 border-l border-border/60 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Bank
                      </th>
                      <th className="max-w-40 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Branch
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Code
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Account no.
                      </th>
                      <th className="w-14 border-l border-border/60 px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Days
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Phone
                      </th>
                      <th
                        className="w-12 px-2 py-2.5 text-center text-muted-foreground/80"
                        aria-label="Actions"
                      >
                        <span className="text-lg font-semibold leading-none tracking-tight" aria-hidden>
                          ⋮
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                          {busy ? "Loading…" : "No account records yet."}
                        </td>
                      </tr>
                    ) : (
                      items.map((row, index) => (
                        <tr
                          key={row.id}
                          className="bg-card transition-colors hover:bg-muted/25"
                        >
                          <td className="px-2 py-2.5 text-center text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="max-w-[11rem] px-3 py-2.5 font-medium text-foreground" title={row.full_name}>
                            <span className="block truncate">{row.full_name}</span>
                          </td>
                          <td
                            className="max-w-[9rem] px-3 py-2.5 text-muted-foreground"
                            title={row.designation}
                          >
                            <span className="block truncate">{row.designation}</span>
                          </td>
                          <td className="max-w-40 truncate px-3 py-2.5 text-foreground/90" title={row.bank_name}>
                            {row.bank_name}
                          </td>
                          <td className="max-w-40 truncate px-3 py-2.5 text-muted-foreground" title={row.branch_name}>
                            {row.branch_name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-foreground">
                            {displayBankCode(row.bank_code)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                            {row.account_number}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-foreground">
                            {row.num_days}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground">
                            {row.telephone_number}
                          </td>
                          <td className="px-1 py-2 text-center align-middle">
                            <Popover
                              open={desktopActionsMenuRowId === row.id}
                              onOpenChange={(open) => {
                                if (open) setDesktopActionsMenuRowId(row.id);
                                else setDesktopActionsMenuRowId((cur) => (cur === row.id ? null : cur));
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-40"
                                  aria-label={`More actions for ${row.full_name}`}
                                >
                                  <span className="select-none text-lg font-semibold leading-none" aria-hidden>
                                    ⋮
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-44 p-1" align="end" side="bottom" sideOffset={4}>
                                <button
                                  type="button"
                                  disabled={!scopeMutationsEnabled}
                                  className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                                  onClick={() => openEdit(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={!scopeMutationsEnabled}
                                  className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
                                  onClick={() => {
                                    setDesktopActionsMenuRowId(null);
                                    setPendingDelete(row);
                                  }}
                                >
                                  Delete
                                </button>
                              </PopoverContent>
                            </Popover>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {!busy && items.length === 0 ? (
                <div className="border-t border-border bg-muted/15 px-3 py-4 text-center">
                  <button type="button" className={officialAccountsBtnPrimary} onClick={openAdd} disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId) || !scopeAddEnabled}>
                    Add first account record
                  </button>
                </div>
              ) : null}
          </div>
          </div>
        </div>

        {modalOpen ? (
          <OfficialModal
            title={editing ? "Update account details" : "Add — account details"}
            subtitle={modalSubtitle}
            titleId="exam-official-modal-title"
            subtitleId="exam-official-modal-subtitle"
            onClose={closeModal}
            formError={formError}
            scrollRef={modalScrollRef}
            focusNameOnMount={!editing}
            footer={
              <div className="flex w-full min-w-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-2">
                <button
                  type="submit"
                  form={FORM_ID}
                  className={`${officialAccountsBtnPrimary} min-h-11 w-full shrink-0 sm:min-h-10 sm:w-auto`}
                  disabled={busy}
                >
                  {busy ? "Saving…" : editing ? "Save changes" : "Add"}
                </button>
                <button
                  type="button"
                  className={`${btnSecondary} sm:order-first`}
                  onClick={closeModal}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            }
          >
            <form
              id={FORM_ID}
              className="space-y-6 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-6 md:space-y-0"
              onSubmit={(e) => void onSubmit(e)}
            >
              <FormSection title="Official">
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor="eo-name">
                  Full name
                </label>
                <input
                  id="eo-name"
                  className={formInputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  enterKeyHint="next"
                  autoComplete="name"
                />
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor="eo-des">
                  Designation
                </label>
                <select
                  id="eo-des"
                  className={formInputClass}
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value as ExamOfficialDesignation)}
                  enterKeyHint="next"
                >
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              </FormSection>
              <FormSection
                title="Bank account details"
                description={accountFieldCopy.description}
              >
              {editing && !editBankOpen ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{selectedBankName}</span>
                    {selectedBranchLabel ? (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        {selectedBranchLabel}
                      </>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setEditBankOpen(true)}
                  >
                    Change bank details
                  </button>
                </div>
              ) : null}
              {showBankFields ? (
                <>
              <div className="md:col-span-2">
                <label className={formLabelClass} id="eo-bank-label">
                  Bank name
                </label>
                <p className="mb-1.5 text-xs text-muted-foreground">Search and select your bank.</p>
                <SearchableCombobox
                  options={bankComboboxOptions}
                  value={selectedBankName}
                  onChange={(name) => {
                    setSelectedBankName(name);
                    setBankNameQuery(name);
                    setSelectedBranchId("");
                    setAccountNumber("");
                    setAccountConfirm("");
                    setFormError(null);
                  }}
                  onSearchChange={(q) => {
                    setBankNameQuery(q);
                    if (!q.trim()) {
                      setSelectedBankName("");
                      setSelectedBranchId("");
                    }
                  }}
                  placeholder="Search banks…"
                  searchPlaceholder="Type bank name…"
                  emptyText={bankNameQuery.trim() ? "No banks found." : "Type to search banks."}
                  widthClass="w-full"
                  showAllOption={false}
                />
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass} id="eo-branch-label">
                  Branch (for this bank)
                </label>
                <SearchableCombobox
                  options={branchComboboxOptions}
                  value={selectedBranchId}
                  onChange={(id) => {
                    setSelectedBranchId(id);
                    if (resolveBankKind(selectedBankName) === "absa") {
                      setAccountNumber("");
                      setAccountConfirm("");
                    }
                  }}
                  placeholder={branchSelectHint}
                  searchPlaceholder="Search branches…"
                  emptyText={
                    !selectedBankName.trim()
                      ? "Choose a bank first."
                      : branchesLoading
                        ? "Loading…"
                        : "No branches found."
                  }
                  widthClass="w-full"
                  showAllOption={false}
                  disabled={!selectedBankName.trim() || branchesLoading || branchRows.length === 0}
                />
                {branchesLoading ? (
                  <p className="mt-1 text-xs text-muted-foreground">Loading branch list…</p>
                ) : null}
              </div>
                </>
              ) : null}
              {editing && !editAccountOpen ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="font-mono text-sm text-foreground">{maskAccountNumber(accountNumber)}</p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setEditAccountOpen(true);
                      setAccountNumber("");
                      setAccountConfirm("");
                    }}
                  >
                    Change account number
                  </button>
                </div>
              ) : null}
              {showAccountFields ? (
                <>
              <div>
                <label className={formLabelClass} htmlFor="eo-acct">
                  {accountFieldCopy.label}
                </label>
                <input
                  id="eo-acct"
                  className={`${formInputClass} font-mono tracking-wide`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, accountMaxLen))
                  }
                  enterKeyHint="next"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {acctLen}/{accountMaxLen} digits
                  {accountFieldCopy.helper ? ` · ${accountFieldCopy.helper}` : ""}
                  {acctValid ? " · format OK" : acctLen > 0 && acctLen < accountMaxLen ? " · keep typing" : ""}
                  {acctConfirmLen > 0 ? (
                    <span className={acctMatch ? " text-success" : " text-destructive"}>
                      {acctMatch ? " · matches confirmation" : " · does not match confirmation"}
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <label className={formLabelClass} htmlFor="eo-acct2">
                  Confirm account number
                </label>
                <input
                  id="eo-acct2"
                  className={`${formInputClass} font-mono tracking-wide`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountConfirm}
                  onChange={(e) =>
                    setAccountConfirm(e.target.value.replace(/\D/g, "").slice(0, accountMaxLen))
                  }
                  onPaste={preventClipboardInsert}
                  onDrop={preventClipboardInsert}
                  enterKeyHint="next"
                />
                <p className="mt-1 text-xs text-muted-foreground">Re-type this value</p>
              </div>
                </>
              ) : null}
              </FormSection>
              <FormSection title="Days and contact">
              {editing && !editDaysOpen ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-sm text-foreground">
                    <span className="font-medium tabular-nums">{numDays}</span> days on duty
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setEditDaysOpen(true);
                      setNumDays("");
                      setNumDaysConfirm("");
                    }}
                  >
                    Change number of days
                  </button>
                </div>
              ) : null}
              {showDaysFields ? (
                <>
              <div>
                <label className={formLabelClass} htmlFor="eo-days">
                  Number of days
                </label>
                <input
                  id="eo-days"
                  className={formInputClass}
                  inputMode="numeric"
                  value={numDays}
                  onChange={(e) => setNumDays(e.target.value.replace(/\D/g, ""))}
                  enterKeyHint="next"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {daysValid ? `Value: ${daysN} (min 1)` : numDays.trim() ? "Enter a whole number ≥ 1" : "At least 1 day"}
                  {numDaysConfirm.trim() ? (
                    <span className={daysMatch ? " text-success" : " text-destructive"}>
                      {daysMatch ? " · matches confirmation" : " · does not match confirmation"}
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <label className={formLabelClass} htmlFor="eo-days2">
                  Confirm number of days
                </label>
                <input
                  id="eo-days2"
                  className={formInputClass}
                  inputMode="numeric"
                  value={numDaysConfirm}
                  onChange={(e) => setNumDaysConfirm(e.target.value.replace(/\D/g, ""))}
                  onPaste={preventClipboardInsert}
                  onDrop={preventClipboardInsert}
                  enterKeyHint="next"
                />
                <p className="mt-1 text-xs text-muted-foreground">Re-type this value.</p>
              </div>
                </>
              ) : null}
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor="eo-phone">
                  Phone number
                </label>
                <input
                  id="eo-phone"
                  className={formInputClass}
                  inputMode="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value.trim())}
                  placeholder="e.g. 0241234567"
                  enterKeyHint="done"
                />
                <p className="mt-1 text-xs text-muted-foreground">{PHONE_HINT}</p>
                {telephone.trim().length > 0 ? (
                  <p className={`mt-0.5 text-xs ${phoneOk ? "text-success" : "text-destructive"}`}>
                    {phoneOk ? "Looks valid." : "Enter a valid 10-digit phone number."}
                  </p>
                ) : null}
              </div>
              </FormSection>
            </form>
          </OfficialModal>
        ) : null}

        {pendingDelete ? (
          <TypeToDeleteConfirmModal
            title="Remove account record?"
            titleId="delete-official-title"
            description={
              <>
                Remove <span className="font-medium text-foreground">{pendingDelete.full_name}</span>? This cannot be
                undone.
              </>
            }
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void confirmDelete()}
            busy={deleteBusy}
          />
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
