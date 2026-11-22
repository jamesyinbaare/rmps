"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { Button } from "@/components/ui/button";
import {
  approveBankDeposit,
  createSchoolFeeInvoice,
  downloadBankDepositFile,
  downloadFeePayingInvoicePdf,
  downloadFreeTvetInvoicePdf,
  downloadReferralInvoicePdf,
  downloadAdminFeePayingInvoicePdfBySchool,
  downloadAdminFreeTvetInvoicePdfBySchool,
  downloadAdminReferralInvoicePdfBySchool,
  downloadSchoolFeeInvoicePdf,
  getFeesSummary,
  listAllSchoolExams,
  listBankDeposits,
  listExams,
  listFeeCandidates,
  listSchoolFeeInvoices,
  listSchools,
  paySchoolFeeInvoiceBankDeposit,
  paySchoolFeeInvoicePaystack,
  rejectBankDeposit,
  triggerBlobDownload,
} from "@/lib/api";
import type {
  BankDepositProof,
  FeeCandidateItem,
  FeesSummary,
  RegistrationExam,
  School,
  SchoolFeeInvoice,
} from "@/types";
import { FeesActivityList, FeesDepositsList } from "./FeesActivityList";
import { FeesBuildRail } from "./FeesBuildRail";
import { FeesCandidatePanel } from "./FeesCandidatePanel";
import { FeesContextBar } from "./FeesContextBar";
import {
  FeesTypeShortcutCards,
  type FeesTypeShortcutKey,
  type FeesTypeShortcutStat,
} from "./FeesTypeShortcutCards";
import { formatGhs } from "./fees-utils";

type Mode = "school" | "admin";

interface FeesInvoicesWorkspaceProps {
  mode: Mode;
  /** When provided (school detail route), lock the workbench to this exam. */
  lockedExamId?: number;
  backHref?: string;
  backLabel?: string;
}

export function FeesInvoicesWorkspace({
  mode,
  lockedExamId,
  backHref,
  backLabel,
}: FeesInvoicesWorkspaceProps) {
  const examLocked = typeof lockedExamId === "number";
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [examId, setExamId] = useState<number | null>(
    examLocked ? lockedExamId : null
  );
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [summary, setSummary] = useState<FeesSummary | null>(null);
  const [freeTvetStat, setFreeTvetStat] =
    useState<FeesTypeShortcutStat | null>(null);
  const [candidates, setCandidates] = useState<FeeCandidateItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>("payable");
  const [invoices, setInvoices] = useState<SchoolFeeInvoice[]>([]);
  const [bankDeposits, setBankDeposits] = useState<BankDepositProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<SchoolFeeInvoice | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const workbenchReady =
    !!examId && (mode === "school" || schoolId !== null);

  useEffect(() => {
    if (examLocked) {
      setExamId(lockedExamId);
    }
  }, [examLocked, lockedExamId]);

  const loadExamsAndSchools = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "school") {
        const data = await listAllSchoolExams();
        setExams(data);
        if (examLocked) {
          setExamId(lockedExamId);
        } else if (data.length > 0) {
          setExamId((prev) => prev ?? data[0].id);
        }
      } else {
        const [examData, schoolData] = await Promise.all([
          listExams(),
          listSchools(),
        ]);
        setExams(examData);
        setSchools(schoolData);
        if (examData.length > 0) {
          setExamId((prev) => prev ?? examData[0].id);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load exams");
    } finally {
      setLoading(false);
    }
  }, [mode, examLocked, lockedExamId]);

  useEffect(() => {
    loadExamsAndSchools();
  }, [loadExamsAndSchools]);

  const refreshData = useCallback(async () => {
    try {
      const [sum, inv] = await Promise.all([
        getFeesSummary(mode, {
          examId: examId || undefined,
          schoolId: mode === "admin" ? schoolId || undefined : undefined,
        }),
        listSchoolFeeInvoices(mode, {
          examId: examId || undefined,
          schoolId: mode === "admin" ? schoolId || undefined : undefined,
        }),
      ]);
      setSummary(sum);
      setInvoices(inv);

      if (examId && (mode === "school" || schoolId)) {
        const schoolScope =
          mode === "admin" ? schoolId || undefined : undefined;
        const [cand, freeTvet] = await Promise.all([
          listFeeCandidates(mode, examId, {
            schoolId: schoolScope,
            registrationType:
              typeFilter === "payable" ? undefined : typeFilter,
            unpaidOnly: true,
          }),
          listFeeCandidates(mode, examId, {
            schoolId: schoolScope,
            registrationType: "free_tvet",
            unpaidOnly: true,
            includeFreeTvet: true,
          }),
        ]);
        setCandidates(cand.candidates);
        setSelectedIds(new Set());
        setFreeTvetStat({
          candidate_count: freeTvet.total_count,
          amount_due: Number(freeTvet.total_amount || 0),
        });
      } else {
        setCandidates([]);
        setSelectedIds(new Set());
        setFreeTvetStat(null);
      }

      if (mode === "admin") {
        const deposits = await listBankDeposits({
          status: "pending_review",
          schoolId: schoolId || undefined,
        });
        setBankDeposits(deposits);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to refresh fees data"
      );
    }
  }, [mode, examId, schoolId, typeFilter]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const selectedTotal = useMemo(
    () =>
      candidates
        .filter((c) => selectedIds.has(c.id))
        .reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [candidates, selectedIds]
  );

  const typeHint = useMemo(() => {
    if (!summary?.by_type?.length) return undefined;
    return summary.by_type
      .map((t) => `${t.candidate_count} ${t.registration_type.replace(/_/g, " ")}`)
      .join(" · ");
  }, [summary]);

  const lockedExam = useMemo(
    () => (examLocked && examId ? exams.find((e) => e.id === examId) : null),
    [examLocked, examId, exams]
  );

  const lockedExamTitle = useMemo(() => {
    if (!lockedExam) return "Fees & Invoices";
    const type = lockedExam.programme_type_name || lockedExam.exam_type;
    const series =
      lockedExam.exam_series_short_name || lockedExam.exam_series;
    return [type, series, lockedExam.year].filter(Boolean).join(" · ");
  }, [lockedExam]);

  const lockedExamSubtitle = useMemo(() => {
    const amount = formatGhs(summary?.amount_due);
    const owing = summary?.unpaid_candidate_count ?? 0;
    const hint = typeHint ? ` · ${typeHint}` : "";
    return `${amount} due · ${owing} candidate${owing === 1 ? "" : "s"} owing${hint}`;
  }, [summary, typeHint]);

  const toggleAll = (checked: boolean, visibleSelectableIds: number[]) => {
    if (!checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleSelectableIds) next.delete(id);
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleSelectableIds) next.add(id);
      return next;
    });
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleCreateInvoice = async () => {
    if (!examId) {
      toast.error("Select an examination first");
      return;
    }
    if (mode === "admin" && !schoolId) {
      toast.error("Select a school first");
      return;
    }
    const candidateIds = Array.from(selectedIds);
    if (candidateIds.length === 0) {
      toast.error("Select at least one candidate");
      return;
    }

    setBusy("create");
    try {
      const invoice = await createSchoolFeeInvoice(mode, {
        exam_id: examId,
        school_id: mode === "admin" ? schoolId || undefined : undefined,
        candidate_ids: candidateIds,
      });
      setActiveInvoice(invoice);
      toast.success(
        invoice.reused
          ? `Using existing invoice ${invoice.invoice_number}`
          : `Invoice ${invoice.invoice_number} ready`
      );
      await refreshData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateTypeInvoice = async (type: FeesTypeShortcutKey) => {
    if (!examId) {
      toast.error("Select an examination first");
      return;
    }
    if (mode === "admin" && !schoolId) {
      toast.error("Select a school first");
      return;
    }
    setBusy(`create-type-${type}`);
    try {
      const invoice = await createSchoolFeeInvoice(mode, {
        exam_id: examId,
        school_id: mode === "admin" ? schoolId || undefined : undefined,
        all_unpaid: true,
        registration_types: [type],
        allow_free_tvet: type === "free_tvet",
      });
      setActiveInvoice(invoice);
      toast.success(
        invoice.reused
          ? `Using existing invoice ${invoice.invoice_number}`
          : `Invoice ${invoice.invoice_number} ready`
      );
      await refreshData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to create type invoice";
      const noEligible = /no eligible candidates to invoice/i.test(message);

      if (noEligible) {
        const openStatuses = new Set([
          "draft",
          "pending",
          "awaiting_bank_confirmation",
        ]);
        const openInvoices = invoices.filter((inv) =>
          openStatuses.has(inv.status)
        );
        const matching =
          openInvoices.find((inv) =>
            (inv.items || []).some((item) => item.registration_type === type)
          ) || openInvoices[0];

        if (matching) {
          setActiveInvoice(matching);
          toast.message(
            type === "free_tvet"
              ? `Using existing Free TVET invoice ${matching.invoice_number}.`
              : `Outstanding candidates are already on invoice ${matching.invoice_number}. Pay it or wait for admin confirmation before generating a new one.`
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          toast.error(
            type === "free_tvet"
              ? "No Free TVET candidates to invoice for this examination."
              : "No eligible candidates to invoice. If fees are still outstanding, pay any open invoice first."
          );
        }
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadTypePdf = async (type: FeesTypeShortcutKey) => {
    if (type === "private") {
      toast.error("No aggregated summary PDF for private candidates");
      return;
    }
    if (!examId) {
      toast.error("Select an examination first");
      return;
    }
    if (mode === "admin" && !schoolId) {
      toast.error("Select a school to download type invoices");
      return;
    }
    const pdfKey =
      type === "fee_paying"
        ? "fee-paying"
        : type === "free_tvet"
          ? "free-tvet"
          : "referral";
    setBusy(`pdf-${type}`);
    try {
      let blob: Blob;
      if (mode === "school") {
        if (type === "fee_paying")
          blob = await downloadFeePayingInvoicePdf(examId, true);
        else if (type === "free_tvet")
          blob = await downloadFreeTvetInvoicePdf(examId, true);
        else blob = await downloadReferralInvoicePdf(examId);
      } else {
        if (type === "fee_paying")
          blob = await downloadAdminFeePayingInvoicePdfBySchool(
            examId,
            schoolId!
          );
        else if (type === "free_tvet")
          blob = await downloadAdminFreeTvetInvoicePdfBySchool(
            examId,
            schoolId!
          );
        else
          blob = await downloadAdminReferralInvoicePdfBySchool(
            examId,
            schoolId!
          );
      }
      triggerBlobDownload(blob, `${pdfKey}_invoice_exam_${examId}.pdf`);
      toast.success("Download started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download invoice");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadInvoicePdf = async (invoice: SchoolFeeInvoice) => {
    setBusy(`inv-pdf-${invoice.id}`);
    try {
      const blob = await downloadSchoolFeeInvoicePdf(mode, invoice.id);
      triggerBlobDownload(blob, `${invoice.invoice_number}.pdf`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to download invoice PDF"
      );
    } finally {
      setBusy(null);
    }
  };

  const handlePaystack = async () => {
    if (!activeInvoice) return;
    setBusy("paystack");
    try {
      const result = await paySchoolFeeInvoicePaystack(mode, activeInvoice.id);
      window.location.href = result.authorization_url;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Payment initialization failed"
      );
      setBusy(null);
    }
  };

  const handleBankDeposit = async (
    file: File,
    ref: string,
    amount: string
  ) => {
    if (!activeInvoice) return;
    setBusy("bank");
    try {
      const updated = await paySchoolFeeInvoiceBankDeposit(
        mode,
        activeInvoice.id,
        file,
        {
          depositReference: ref || undefined,
          depositedAmount: amount || undefined,
        }
      );
      setActiveInvoice(updated);
      toast.success("Pay-in slip uploaded — awaiting confirmation");
      await refreshData();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Bank deposit upload failed"
      );
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (proofId: number) => {
    setBusy(`approve-${proofId}`);
    try {
      await approveBankDeposit(proofId);
      toast.success("Payment confirmed");
      await refreshData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (proofId: number) => {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setBusy(`reject-${proofId}`);
    try {
      await rejectBankDeposit(proofId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      toast.success("Deposit rejected");
      await refreshData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div
      className={
        examLocked
          ? "mx-auto max-w-6xl space-y-4"
          : "mx-auto max-w-6xl space-y-6"
      }
    >
      {examLocked ? (
        <PageHeader
          back={
            backHref ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 shadow-none"
                asChild
              >
                <Link href={backHref}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  {backLabel || "Fees"}
                </Link>
              </Button>
            ) : undefined
          }
          title={lockedExamTitle}
          subtitle={lockedExamSubtitle}
        />
      ) : (
        <PageHeader
          title="Fees & Invoices"
          subtitle={
            mode === "school"
              ? "Select candidates, create an invoice, then pay with MoMo, card, or bank deposit"
              : "Manage school fees, invoices, and confirm bank deposits"
          }
        />
      )}

      {!examLocked ? (
        <>
          <FeesContextBar
            mode={mode}
            exams={exams}
            schools={schools}
            examId={examId}
            schoolId={schoolId}
            examLocked={examLocked}
            backHref={backHref}
            backLabel={backLabel}
            onExamChange={(id) => {
              if (examLocked) return;
              setExamId(id);
              setActiveInvoice(null);
            }}
            onSchoolChange={(id) => {
              setSchoolId(id);
              setActiveInvoice(null);
            }}
          />

          <StatStrip
            items={[
              {
                label: "Amount due",
                value: formatGhs(summary?.amount_due),
                hint: "Unpaid fee-paying, referral, and private",
              },
              {
                label: "Candidates owing",
                value: summary?.unpaid_candidate_count ?? 0,
                hint: typeHint,
              },
            ]}
          />
        </>
      ) : null}

      <FeesTypeShortcutCards
        byType={summary?.by_type ?? []}
        freeTvetStat={freeTvetStat}
        busy={busy}
        disabled={!workbenchReady}
        onInvoiceOutstanding={handleCreateTypeInvoice}
        onDownloadSummaryPdf={handleDownloadTypePdf}
      />

      <FeesCandidatePanel
        candidates={candidates}
        selectedIds={selectedIds}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        onToggleAll={toggleAll}
        onToggleOne={toggleOne}
        gated={!workbenchReady}
        gateMessage={
          mode === "admin" && !schoolId
            ? "Select a school and examination to browse candidates."
            : "Select an examination to browse unpaid candidates."
        }
      />

      {mode === "admin" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card animate-in fade-in duration-200">
          <div className="border-b border-border p-4">
            <p className="text-sm font-medium">Pending bank deposits</p>
            <p className="text-xs text-muted-foreground">
              Confirm pay-in slips to clear fee gates for invoiced candidates
            </p>
          </div>
          <FeesDepositsList
            deposits={bankDeposits}
            busy={busy}
            rejectReason={rejectReason}
            rejectingId={rejectingId}
            onRejectReasonChange={setRejectReason}
            onSetRejecting={setRejectingId}
            onApprove={handleApprove}
            onReject={handleReject}
            onDownloadSlip={async (proof) => {
              const blob = await downloadBankDepositFile(proof.id);
              triggerBlobDownload(blob, proof.file_name);
            }}
          />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="shrink-0 border-b border-border p-4">
            <p className="text-sm font-medium">Invoice activity</p>
            <p className="text-xs text-muted-foreground">
              Recent invoices for this examination
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <FeesActivityList
              invoices={invoices}
              busy={busy}
              selectedInvoiceId={activeInvoice?.id ?? null}
              onDownloadPdf={handleDownloadInvoicePdf}
              onSelectInvoice={(inv) => {
                setActiveInvoice(inv);
              }}
            />
          </div>
        </section>

        <FeesBuildRail
          selectedCount={selectedIds.size}
          selectedTotal={selectedTotal}
          activeInvoice={activeInvoice}
          busy={busy}
          onBuild={handleCreateInvoice}
          onDownloadPdf={handleDownloadInvoicePdf}
          onPaystack={handlePaystack}
          onBankDeposit={handleBankDeposit}
          onClearInvoice={() => setActiveInvoice(null)}
        />
      </div>
    </div>
  );
}
