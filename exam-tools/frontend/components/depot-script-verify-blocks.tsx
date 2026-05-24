import type { ReactNode } from "react";

import { seriesInspectorBadgeClass } from "@/lib/paper-inspector-styles";
import { packingCountFieldLabel, packingItemPlural } from "@/lib/script-packing-terms";
import { depotPaperBadgeClass, depotPaperCardAccentClass } from "@/lib/depot-script-paper-visual";

type DepotPaperHeaderProps = {
  subjectCode: string;
  subjectName: string;
  paperNumber: number;
  envelopeCount?: number;
  totalBooklets?: number;
  itemsWord?: string;
};

export function DepotPaperHeader({
  subjectCode,
  subjectName,
  paperNumber,
  envelopeCount,
  totalBooklets,
  itemsWord,
}: DepotPaperHeaderProps) {
  const items = itemsWord ?? packingItemPlural(paperNumber);
  const showTotals =
    envelopeCount != null &&
    totalBooklets != null &&
    (envelopeCount > 0 || totalBooklets > 0);

  return (
    <div className="space-y-2 border-b border-border/60 pb-3">
      <p className="text-sm font-medium text-muted-foreground">
        {subjectCode} — {subjectName}
      </p>
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
          <span
            className={`inline-flex rounded-md border px-2.5 py-1 text-sm font-bold tabular-nums ${depotPaperBadgeClass(paperNumber)}`}
          >
            P{paperNumber}
          </span>
          <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">
            Paper {paperNumber}
          </span>
        </div>
        {showTotals ? (
          <p className="text-center text-xs tabular-nums text-muted-foreground sm:text-right">
            <span className="font-semibold text-foreground">{envelopeCount}</span> envelopes ·{" "}
            <span className="font-semibold text-foreground">{totalBooklets}</span> {items}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type DepotSeriesBlockProps = {
  seriesNumber: number;
  paperNumber: number;
  envelopeCount: number;
  totalBooklets: number;
  verified: boolean;
  /** Defaults to packingItemPlural(paperNumber). */
  itemsWord?: string;
  children: ReactNode;
};

export function DepotSeriesBlock({
  seriesNumber,
  paperNumber,
  envelopeCount,
  totalBooklets,
  verified,
  itemsWord,
  children,
}: DepotSeriesBlockProps) {
  const items = itemsWord ?? packingItemPlural(paperNumber);
  return (
    <section className="overflow-hidden rounded-xl border-2 border-secondary/35 bg-background shadow-sm">
      <div className="flex flex-col items-center gap-2 border-b border-secondary/25 bg-secondary/10 px-3 py-2.5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <span className={`${seriesInspectorBadgeClass} text-sm`}>Series {seriesNumber}</span>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground sm:justify-end">
          <span>
            <span className="font-semibold text-foreground">{envelopeCount}</span> envelopes
          </span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <span>
            <span className="font-semibold text-foreground">{totalBooklets}</span> {items}
          </span>
          {verified ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
              Done
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

type DepotEnvelopeRowProps = {
  envelopeNumber: number;
  bookletCount: number;
  paperNumber: number;
  verified: boolean;
  verifying: boolean;
  busy: boolean;
  onToggle: () => void;
  verifyBtnPrimary: string;
  verifyBtnSecondary: string;
};

export function DepotEnvelopeRow({
  envelopeNumber,
  bookletCount,
  paperNumber,
  verified,
  verifying,
  busy,
  onToggle,
  verifyBtnPrimary,
  verifyBtnSecondary,
}: DepotEnvelopeRowProps) {
  const countLabel = packingCountFieldLabel(paperNumber);

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        verified
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border/70 bg-background/80"
      }`}
    >
      <div className="mx-auto grid w-full max-w-[16rem] grid-cols-2 gap-4 sm:mx-0 sm:max-w-none sm:flex sm:flex-1 sm:justify-center sm:gap-10">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Envelope no.
          </span>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 text-lg font-bold tabular-nums text-foreground"
            aria-label={`Envelope number ${envelopeNumber}`}
          >
            {envelopeNumber}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {countLabel}
          </span>
          <span
            className="text-2xl font-bold leading-none tabular-nums text-foreground"
            aria-label={`${bookletCount} ${countLabel.toLowerCase()}`}
          >
            {bookletCount}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`${verified ? verifyBtnSecondary : verifyBtnPrimary} w-full sm:w-auto sm:shrink-0`}
        disabled={busy || verifying}
        onClick={onToggle}
      >
        {verifying
          ? verified
            ? "Unverifying…"
            : "Verifying…"
          : verified
            ? "Unverify"
            : "Verify"}
      </button>
    </li>
  );
}

export function depotPaperCardClass(paperNumber: number): string {
  return `rounded-lg border border-border/70 bg-background/70 p-3 ${depotPaperCardAccentClass(paperNumber)}`;
}
