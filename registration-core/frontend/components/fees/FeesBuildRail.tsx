"use client";

import { useState } from "react";
import {
  CreditCard,
  Download,
  Landmark,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SchoolFeeInvoice } from "@/types";
import { formatGhs, statusLabel } from "./fees-utils";

interface FeesBuildRailProps {
  selectedCount: number;
  selectedTotal: number;
  activeInvoice: SchoolFeeInvoice | null;
  busy: string | null;
  onBuild: () => void;
  onDownloadPdf: (invoice: SchoolFeeInvoice) => void;
  onPaystack: () => void;
  onBankDeposit: (file: File, ref: string, amount: string) => void;
  onClearInvoice: () => void;
}

export function FeesBuildRail({
  selectedCount,
  selectedTotal,
  activeInvoice,
  busy,
  onBuild,
  onDownloadPdf,
  onPaystack,
  onBankDeposit,
  onClearInvoice,
}: FeesBuildRailProps) {
  const [bankOpen, setBankOpen] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [depositRef, setDepositRef] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const unpaid =
    !!activeInvoice &&
    activeInvoice.status === "pending" &&
    Number(activeInvoice.amount) > 0;

  const submitBank = () => {
    if (!slipFile) return;
    onBankDeposit(slipFile, depositRef, depositAmount);
    setSlipFile(null);
    setDepositRef("");
    setDepositAmount("");
    setBankOpen(false);
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-4">
      <div className="shrink-0 border-b border-border p-4">
        <p className="text-sm font-medium">Make payment</p>
        <p className="text-xs text-muted-foreground">
          Review invoice details and settle fees
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {!activeInvoice ? (
          <div
            key="empty"
            className="flex flex-1 flex-col gap-4 animate-in fade-in duration-200"
          >
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 transition-colors">
              {selectedCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Select candidates above to create an invoice, or choose an
                  invoice from activity.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Selection
                  </p>
                  <p className="font-mono text-2xl font-medium tracking-tight">
                    {formatGhs(selectedTotal)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCount} candidate{selectedCount === 1 ? "" : "s"}
                  </p>
                </div>
              )}
            </div>

            <Button
              className="w-full shadow-none transition-colors"
              disabled={busy !== null || selectedCount === 0}
              onClick={onBuild}
            >
              <Receipt className="mr-2 h-4 w-4" />
              {busy === "create" ? "Creating…" : "Create invoice"}
            </Button>
          </div>
        ) : (
          <div
            key={activeInvoice.id}
            className="flex flex-col gap-4 animate-in fade-in duration-200"
          >
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-medium">
                    {activeInvoice.invoice_number}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {statusLabel(activeInvoice.status)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  onClick={onClearInvoice}
                >
                  Clear
                </button>
              </div>
              <p className="font-mono text-2xl font-medium tracking-tight">
                {formatGhs(activeInvoice.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeInvoice.item_count} candidate
                {activeInvoice.item_count === 1 ? "" : "s"}
              </p>
            </div>

            {(activeInvoice.items?.length ?? 0) > 0 ? (
              <div className="overflow-hidden rounded-md border border-border">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Candidates on this invoice
                  </p>
                </div>
                <div className="max-h-40 overflow-auto">
                  <ul className="divide-y divide-border">
                    {activeInvoice.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {item.candidate_name || "Candidate"}
                          </p>
                          <p className="font-mono text-muted-foreground">
                            {item.registration_number ||
                              `ID ${item.candidate_id}`}
                            {item.registration_type
                              ? ` · ${item.registration_type.replace(/_/g, " ")}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono tabular-nums">
                          {formatGhs(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <Button
              variant="outline"
              className="w-full shadow-none transition-colors"
              disabled={busy !== null}
              onClick={() => onDownloadPdf(activeInvoice)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>

            {unpaid ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Settle payment
                </p>
                <Button
                  className="w-full shadow-none transition-colors"
                  disabled={busy !== null}
                  onClick={onPaystack}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {busy === "paystack"
                    ? "Redirecting…"
                    : "Pay with MoMo or card"}
                </Button>

                <div className="overflow-hidden rounded-md border border-border">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors",
                      "hover:bg-muted/50"
                    )}
                    onClick={() => setBankOpen((o) => !o)}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Landmark className="h-4 w-4" />
                      Bank deposit
                    </span>
                    {bankOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {bankOpen ? (
                    <div className="space-y-3 border-t border-border p-3 animate-in fade-in duration-200">
                      <div className="space-y-1.5">
                        <Label htmlFor="fees-slip" className="text-xs">
                          Pay-in slip
                        </Label>
                        <Input
                          id="fees-slip"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            setSlipFile(e.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fees-ref" className="text-xs">
                          Deposit reference
                        </Label>
                        <Input
                          id="fees-ref"
                          value={depositRef}
                          onChange={(e) => setDepositRef(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fees-amt" className="text-xs">
                          Deposited amount
                        </Label>
                        <Input
                          id="fees-amt"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder={String(activeInvoice.amount)}
                        />
                      </div>
                      <Button
                        className="w-full shadow-none"
                        variant="secondary"
                        disabled={busy !== null || !slipFile}
                        onClick={submitBank}
                      >
                        {busy === "bank" ? "Uploading…" : "Upload pay-in slip"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : activeInvoice.status === "draft" ? (
              <p className="text-sm text-muted-foreground">
                Download-only invoice. Payment is not required.
              </p>
            ) : activeInvoice.status === "awaiting_bank_confirmation" ? (
              <p className="text-sm text-muted-foreground">
                Pay-in slip submitted. Waiting for admin confirmation.
              </p>
            ) : activeInvoice.status === "paid" ? (
              <p className="text-sm text-muted-foreground">
                This invoice is paid. No further payment is needed.
              </p>
            ) : activeInvoice.status === "cancelled" ? (
              <p className="text-sm text-muted-foreground">
                This invoice was cancelled.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Payment is not available for this invoice.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
