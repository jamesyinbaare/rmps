"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BankDepositProof, SchoolFeeInvoice } from "@/types";
import { canPayInvoice, formatGhs, statusLabel } from "./fees-utils";

interface FeesActivityListProps {
  invoices: SchoolFeeInvoice[];
  busy: string | null;
  selectedInvoiceId?: number | null;
  onDownloadPdf: (invoice: SchoolFeeInvoice) => void;
  onSelectInvoice: (invoice: SchoolFeeInvoice) => void;
}

export function FeesActivityList({
  invoices,
  busy,
  selectedInvoiceId = null,
  onDownloadPdf,
  onSelectInvoice,
}: FeesActivityListProps) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {invoices.map((inv, index) => {
        const selected = selectedInvoiceId === inv.id;
        const unpaid = canPayInvoice(inv.status, Number(inv.amount));

        return (
          <div
            key={inv.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectInvoice(inv)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectInvoice(inv);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 border-l-2 px-4 py-3.5 transition-colors duration-150",
              "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              unpaid
                ? "border-l-amber-500 bg-amber-500/[0.06]"
                : "border-l-transparent opacity-75",
              selected && "bg-muted/40 ring-1 ring-inset ring-border opacity-100"
            )}
          >
            <span
              className={cn(
                "w-6 shrink-0 font-mono text-xs tabular-nums",
                unpaid
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              )}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-sm",
                    unpaid ? "font-semibold text-foreground" : "font-medium"
                  )}
                >
                  {inv.invoice_number}
                </span>
                <StatusChip status={inv.status} />
              </div>
              <p
                className={cn(
                  "text-sm",
                  unpaid
                    ? "text-foreground/80"
                    : "text-muted-foreground"
                )}
              >
                <span className="font-mono tabular-nums">
                  {formatGhs(inv.amount)}
                </span>
                {" · "}
                {inv.item_count} candidate{inv.item_count === 1 ? "" : "s"}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 shadow-none"
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                onDownloadPdf(inv);
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "paid"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "pending"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : status === "awaiting_bank_confirmation"
          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          : status === "cancelled"
            ? "bg-muted text-muted-foreground"
            : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        tone
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

interface FeesDepositsListProps {
  deposits: BankDepositProof[];
  busy: string | null;
  rejectReason: string;
  rejectingId: number | null;
  onRejectReasonChange: (v: string) => void;
  onSetRejecting: (id: number | null) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDownloadSlip: (proof: BankDepositProof) => void;
}

export function FeesDepositsList({
  deposits,
  busy,
  rejectReason,
  rejectingId,
  onRejectReasonChange,
  onSetRejecting,
  onApprove,
  onReject,
  onDownloadSlip,
}: FeesDepositsListProps) {
  if (deposits.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No pending pay-in slips.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {deposits.map((proof) => (
        <div
          key={proof.id}
          className="space-y-3 p-4 transition-colors duration-200 hover:bg-muted/30"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-sm font-medium">
                {proof.invoice_number || `Proof #${proof.id}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {proof.school_name || "School"}
                {proof.deposit_reference
                  ? ` · Ref ${proof.deposit_reference}`
                  : ""}
                {proof.deposited_amount != null
                  ? ` · ${formatGhs(proof.deposited_amount)}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">{proof.file_name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 shadow-none"
                disabled={busy !== null}
                onClick={() => onDownloadSlip(proof)}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Slip
              </Button>
              <Button
                size="sm"
                className="h-8 shadow-none"
                disabled={busy !== null}
                onClick={() => onApprove(proof.id)}
              >
                {busy === `approve-${proof.id}` ? "Approving…" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 shadow-none"
                disabled={busy !== null}
                onClick={() =>
                  onSetRejecting(rejectingId === proof.id ? null : proof.id)
                }
              >
                Reject
              </Button>
            </div>
          </div>
          {rejectingId === proof.id ? (
            <div className="flex flex-col gap-2 sm:flex-row animate-in fade-in duration-200">
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="Rejection reason"
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                className="shadow-none"
                disabled={busy !== null || !rejectReason.trim()}
                onClick={() => onReject(proof.id)}
              >
                Confirm reject
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
