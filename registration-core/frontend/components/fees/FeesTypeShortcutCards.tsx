"use client";

import { Download, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeeTypeBreakdown } from "@/types";
import { formatGhs } from "./fees-utils";

export type FeesTypeShortcutKey =
  | "fee_paying"
  | "referral"
  | "private"
  | "free_tvet";

export interface FeesTypeShortcutStat {
  candidate_count: number;
  amount_due: number;
}

interface FeesTypeShortcutCardsProps {
  byType: FeeTypeBreakdown[];
  freeTvetStat?: FeesTypeShortcutStat | null;
  busy: string | null;
  disabled?: boolean;
  onInvoiceOutstanding: (type: FeesTypeShortcutKey) => void;
  onDownloadSummaryPdf: (type: FeesTypeShortcutKey) => void;
}

const CARDS: {
  key: FeesTypeShortcutKey;
  label: string;
  primaryLabel: string;
  invoiceAction: boolean;
  showSummaryPdf: boolean;
}[] = [
  {
    key: "fee_paying",
    label: "Fee-paying",
    primaryLabel: "Invoice outstanding",
    invoiceAction: true,
    showSummaryPdf: true,
  },
  {
    key: "referral",
    label: "Referral",
    primaryLabel: "Invoice outstanding",
    invoiceAction: true,
    showSummaryPdf: true,
  },
  {
    key: "private",
    label: "Private",
    primaryLabel: "Invoice outstanding",
    invoiceAction: true,
    showSummaryPdf: false,
  },
  {
    key: "free_tvet",
    label: "Free TVET",
    primaryLabel: "Generate invoice",
    invoiceAction: true,
    showSummaryPdf: true,
  },
];

function statsFor(
  key: FeesTypeShortcutKey,
  byType: FeeTypeBreakdown[],
  freeTvetStat?: FeesTypeShortcutStat | null
): FeesTypeShortcutStat {
  if (key === "free_tvet") {
    return {
      candidate_count: freeTvetStat?.candidate_count ?? 0,
      amount_due: freeTvetStat?.amount_due ?? 0,
    };
  }
  const row = byType.find((t) => t.registration_type === key);
  return {
    candidate_count: row?.candidate_count ?? 0,
    amount_due: Number(row?.amount_due ?? 0),
  };
}

export function FeesTypeShortcutCards({
  byType,
  freeTvetStat,
  busy,
  disabled = false,
  onInvoiceOutstanding,
  onDownloadSummaryPdf,
}: FeesTypeShortcutCardsProps) {
  const visibleCards = CARDS.filter((card) => {
    const stats = statsFor(card.key, byType, freeTvetStat);
    return stats.candidate_count > 0;
  });

  if (visibleCards.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleCards.map((card) => {
        const stats = statsFor(card.key, byType, freeTvetStat);
        const createBusy = busy === `create-type-${card.key}`;
        const pdfBusy = busy === `pdf-${card.key}`;

        return (
          <div
            key={card.key}
            className={cn(
              "flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-none sm:flex-row sm:items-center sm:justify-between"
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{card.label}</p>
                <p className="font-mono text-sm tabular-nums text-muted-foreground">
                  {stats.candidate_count.toLocaleString()}{" "}
                  {card.key === "free_tvet" ? "candidates" : "owing"}
                  {card.key === "free_tvet"
                    ? ""
                    : ` · ${formatGhs(stats.amount_due)}`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {card.showSummaryPdf ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shadow-none"
                  disabled={disabled || busy !== null}
                  title={pdfBusy ? "Downloading…" : "Summary PDF"}
                  onClick={() => onDownloadSummaryPdf(card.key)}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="sr-only">Summary PDF</span>
                </Button>
              ) : null}
              {card.invoiceAction ? (
                <Button
                  size="sm"
                  className="h-9 shadow-none"
                  disabled={disabled || busy !== null}
                  onClick={() => onInvoiceOutstanding(card.key)}
                >
                  {createBusy ? "Creating…" : card.primaryLabel}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
