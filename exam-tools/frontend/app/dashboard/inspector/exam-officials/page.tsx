"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  createExamOfficial,
  deleteExamOfficial,
  displayBankCode,
  getDistinctBankNames,
  getExamOfficialsForMyCentre,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  listBankBranches,
  updateExamOfficial,
  type BankBranchRow,
  type Examination,
  type ExamOfficialDesignation,
  type ExamCentreOfficialResponse,
  type ExamCentreOfficialCreatePayload,
  type MyInspectorPostingRow,
} from "@/lib/api";
import { inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";

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
];

const GHANA_PHONE_RE = /^0(20|23|24|25|26|27|28|29|50|54|55|56|57|59)\d{7}$/;
const ACCOUNT_RE = /^\d{13}$/;
const PHONE_HINT =
  "Enter a 10-digit phone number. (for example 0241234567).";

function truncateLabel(s: string, max = 28): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function OfficialModal({
  title,
  titleId,
  onClose,
  children,
  footer,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
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
    const t = window.setTimeout(() => {
      const el = document.getElementById("eo-name");
      if (el && typeof el.focus === "function") el.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-lg sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        <div className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {footer}
        </div>
      </div>
    </div>
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

function DeleteConfirmModal({
  name,
  onCancel,
  onConfirm,
  busy,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Dismiss" className="absolute inset-0 bg-foreground/40" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-official-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id="delete-official-title" className="text-lg font-semibold text-card-foreground">
          Remove account record?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Remove <span className="font-medium text-foreground">{name}</span> from this centre&apos;s account-details list
          for this examination. This cannot be undone.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InspectorExamOfficialsPage() {
  const FORM_ID = "exam-official-form";
  const router = useRouter();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [items, setItems] = useState<ExamCentreOfficialResponse[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  /** Mobile cards: edit/delete only after expanding this row */
  const [mobileOfficialActionsOpenId, setMobileOfficialActionsOpenId] = useState<string | null>(null);
  /** Desktop table: which row’s ⋮ actions menu is open */
  const [desktopActionsMenuRowId, setDesktopActionsMenuRowId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (examId === null) return;
    if (postings.length > 0 && !selectedPostingId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getExamOfficialsForMyCentre(
        examId,
        postings.length > 0 ? selectedPostingId : undefined,
      );
      setItems(res.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load exam officials");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [examId, postings.length, selectedPostingId]);

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
        setSelectedPostingId((prev) => pickInspectorPostingId(postingRes.items, prev));
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

  function commitBankNameFromQuery(): boolean {
    const t = bankNameQuery.trim();
    if (!t) {
      setFormError("Enter a bank name to search.");
      return false;
    }
    const exact = bankNameSuggestions.find((n) => n.toLowerCase() === t.toLowerCase());
    if (exact !== undefined) {
      setSelectedBankName(exact);
      setBankNameQuery(exact);
      setFormError(null);
      return true;
    }
    if (bankNameSuggestions.length === 1) {
      const only = bankNameSuggestions[0]!;
      setSelectedBankName(only);
      setBankNameQuery(only);
      setFormError(null);
      return true;
    }
    setSelectedBankName(t);
    setFormError(null);
    return true;
  }

  function openAdd() {
    setEditing(null);
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
  }

  function openEdit(row: ExamCentreOfficialResponse) {
    setMobileOfficialActionsOpenId(null);
    setDesktopActionsMenuRowId(null);
    setEditing(row);
    setFullName(row.full_name);
    setDesignation(row.designation);
    setTelephone(row.telephone_number);
    setAccountNumber(row.account_number);
    setAccountConfirm(row.account_number);
    setNumDays(String(row.num_days));
    setNumDaysConfirm(String(row.num_days));
    setSelectedBankName(row.bank_name);
    setBankNameQuery(row.bank_name);
    setSelectedBranchId(row.bank_branch_id);
    setBranchRows([]);
    setBranchesLoading(true);
    setFormError(null);
    setModalOpen(true);
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
    setFormError(null);

    if (!selectedBranchId.trim()) {
      setFormError("Select a bank and branch.");
      return;
    }
    if (!ACCOUNT_RE.test(accountNumber.trim())) {
      setFormError("Account number must be exactly 13 digits.");
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
      setFormError(
        "Enter a valid 10-digit Ghana number in national format (starting with 0).",
      );
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
        );
      } else {
        await createExamOfficial(examId, payload, postingParam);
      }
      closeModal();
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (examId === null || pendingDelete === null) return;
    if (postings.length > 0 && !selectedPostingId) return;
    setDeleteBusy(true);
    try {
      await deleteExamOfficial(
        examId,
        pendingDelete.id,
        postings.length > 0 ? selectedPostingId : undefined,
      );
      setPendingDelete(null);
      setMobileOfficialActionsOpenId(null);
      setDesktopActionsMenuRowId(null);
      await loadList();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  const acctLen = accountNumber.replace(/\D/g, "").length;
  const acctConfirmLen = accountConfirm.replace(/\D/g, "").length;
  const acctValid = ACCOUNT_RE.test(accountNumber.trim());
  const acctMatch =
    acctValid && accountNumber.trim() === accountConfirm.trim() && accountConfirm.trim().length === 13;

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

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Official account details" staffRole="inspector">
        <div className="space-y-6">
          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
            <p className="font-medium">Register officials&apos; account details</p>
            <p className="mt-1 text-muted-foreground">
              Register supervisors, invigilators, and other centre officials for this examination. Enter each
              person&apos;s bank account and contact details so allowances can be processed.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Account numbers are stored for processing official allowances only.
            </p>
          </div>

          <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 rounded-xl border border-border bg-background/95 px-3 py-3 shadow-sm backdrop-blur sm:static sm:z-0 sm:mx-0 sm:flex-row sm:flex-wrap sm:items-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-none">
            <div className="min-w-48 flex-1">
              {examId != null && exams[0] ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Examination</span>
                  {": "}
                  {exams[0].year}
                  {exams[0].exam_series ? ` ${exams[0].exam_series}` : ""} — {exams[0].exam_type}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className={btnPrimary}
              onClick={openAdd}
              disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId)}
            >
              Add official account details
            </button>
          </div>

          {/* Mobile cards */}
          <div className="space-y-4 md:hidden">
            {busy && items.length === 0 ? (
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">Loading account records…</p>
                <p className="mt-1 text-xs text-muted-foreground/80">Please wait</p>
              </div>
            ) : null}
            {!busy && items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No account records yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add each official who should receive an allowance for this examination.
                </p>
                <button
                  type="button"
                  className={`${btnPrimary} mx-auto mt-5 max-w-xs`}
                  onClick={openAdd}
                  disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId)}
                >
                  Add first account record
                </button>
              </div>
            ) : null}
            {items.map((row, index) => {
              const rowNum = index + 1;
              return (
              <article
                key={row.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-black/4 dark:ring-white/6"
              >
                <div className="flex min-w-0">
                  <div
                    className="w-1 shrink-0 bg-gradient-to-b from-primary via-primary/90 to-primary/70"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 p-4 sm:p-5">
                    <header className="flex flex-wrap items-start gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 text-sm font-semibold tabular-nums text-muted-foreground"
                        aria-label={`Official ${rowNum}`}
                      >
                        {rowNum}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <h3 className="text-base font-semibold leading-tight tracking-tight text-foreground">
                          {row.full_name}
                        </h3>
                        <span className="inline-flex max-w-full rounded-md bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">
                          {row.designation}
                        </span>
                      </div>
                    </header>

                    <div
                      className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-3"
                      title={`${row.bank_name} · ${row.branch_name}`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Account — bank & branch
                      </p>
                      <p className="text-sm leading-snug text-foreground">{truncateLabel(row.bank_name, 42)}</p>
                      <p className="text-sm leading-snug text-muted-foreground">{truncateLabel(row.branch_name, 44)}</p>
                      <p className="pt-1 font-mono text-xs text-muted-foreground">
                        Code <span className="rounded bg-background/80 px-1.5 py-0.5 font-medium text-foreground ring-1 ring-border/60">
                          {displayBankCode(row.bank_code)}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2.5 text-center shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bank account</p>
                        <p className="mt-1 truncate font-mono text-xs tabular-nums text-foreground" title={row.account_number}>
                          {row.account_number}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2.5 text-center shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Days on duty</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{row.num_days}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2.5 text-center shadow-sm">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                        <p className="mt-1 truncate text-xs tabular-nums text-foreground" title={row.telephone_number}>
                          {row.telephone_number}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-muted/10 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 hover:text-foreground"
                        onClick={() =>
                          setMobileOfficialActionsOpenId((id) => (id === row.id ? null : row.id))
                        }
                        aria-expanded={mobileOfficialActionsOpenId === row.id}
                      >
                        <span>{mobileOfficialActionsOpenId === row.id ? "Hide edit & delete" : "Edit or delete…"}</span>
                        <span
                          className={`shrink-0 text-[10px] leading-none text-muted-foreground/70 transition-transform duration-200 ${
                            mobileOfficialActionsOpenId === row.id ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        >
                          ▼
                        </span>
                      </button>
                      {mobileOfficialActionsOpenId === row.id ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/15 p-2">
                          <button type="button" className={btnSecondary} onClick={() => openEdit(row)} disabled={busy}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className={btnDanger}
                            onClick={() => {
                              setMobileOfficialActionsOpenId(null);
                              setPendingDelete(row);
                            }}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
                                  className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                                  onClick={() => openEdit(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
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
                  <button type="button" className={btnPrimary} onClick={openAdd} disabled={examId === null || busy || (postings.length > 0 && !selectedPostingId)}>
                    Add first account record
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {modalOpen ? (
          <OfficialModal
            title={editing ? "Update account details" : "Register official — account details"}
            titleId="exam-official-modal-title"
            onClose={closeModal}
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className={btnSecondary} onClick={closeModal} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" form={FORM_ID} className={btnPrimary} disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save changes" : "Add"}
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
                description="13-digit account number at the selected branch."
              >
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor="eo-bank-q">
                  Bank name
                </label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Search, pick a suggestion, then tap{" "}
                  <strong className="font-medium text-foreground">Use this bank name</strong>.
                </p>
                <input
                  id="eo-bank-q"
                  className={formInputClass}
                  value={bankNameQuery}
                  onChange={(e) => {
                    setBankNameQuery(e.target.value);
                    setSelectedBankName("");
                    setSelectedBranchId("");
                  }}
                  onBlur={() => {
                    const t = bankNameQuery.trim();
                    if (!t) return;
                    const exact = bankNameSuggestions.find((n) => n.toLowerCase() === t.toLowerCase());
                    if (exact !== undefined) {
                      setSelectedBankName(exact);
                      setBankNameQuery(exact);
                      setFormError(null);
                      return;
                    }
                    if (bankNameSuggestions.length === 1) {
                      const only = bankNameSuggestions[0]!;
                      setSelectedBankName(only);
                      setBankNameQuery(only);
                      setFormError(null);
                    }
                  }}
                  list="bank-name-datalist"
                  placeholder="Type to search banks"
                  enterKeyHint="next"
                />
                <datalist id="bank-name-datalist">
                  {bankNameSuggestions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className={`${btnSecondary} mt-2 w-full sm:w-auto`}
                  onClick={() => {
                    commitBankNameFromQuery();
                  }}
                >
                  Use this bank name
                </button>
                {selectedBankName ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected bank: <span className="font-medium text-foreground">{selectedBankName}</span>
                  </p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor="eo-branch">
                  Branch (for this bank)
                </label>
                <select
                  id="eo-branch"
                  className={formInputClass}
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  disabled={!selectedBankName.trim() || branchesLoading || branchRows.length === 0}
                  enterKeyHint="next"
                >
                  <option value="">{branchSelectHint}</option>
                  {branchRows.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name} ({displayBankCode(b.bank_code)})
                    </option>
                  ))}
                </select>
                {branchesLoading ? (
                  <p className="mt-1 text-xs text-muted-foreground">Loading branch list…</p>
                ) : null}
              </div>
              <div>
                <label className={formLabelClass} htmlFor="eo-acct">
                  Account number (13 digits)
                </label>
                <input
                  id="eo-acct"
                  className={`${formInputClass} font-mono tracking-wide`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  enterKeyHint="next"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {acctLen}/13 digits
                  {acctValid ? " · format OK" : acctLen > 0 && acctLen < 13 ? " · keep typing" : ""}
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
                  onChange={(e) => setAccountConfirm(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  enterKeyHint="next"
                />
              </div>
              </FormSection>
              <FormSection title="Days and contact">
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
                  enterKeyHint="next"
                />
              </div>
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
                    {phoneOk ? "Looks valid." : "This does not look like a valid Ghana number yet."}
                  </p>
                ) : null}
              </div>
              </FormSection>
              {formError ? (
                <p className="md:col-span-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </form>
          </OfficialModal>
        ) : null}

        {pendingDelete ? (
          <DeleteConfirmModal
            name={pendingDelete.full_name}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void confirmDelete()}
            busy={deleteBusy}
          />
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
