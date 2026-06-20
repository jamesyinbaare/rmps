"use client";

import { Button } from "@/components/ui/button";
import type { MarkedScriptReturnRow } from "@/lib/api";
import { cn } from "@/lib/utils";

const METRICS_GRID_CLASS = "grid grid-cols-3 gap-2";

type MetricTileProps = {
  label: string;
  value: string;
  emphasized?: boolean;
  verified?: boolean;
};

function VerificationMetricTile({ label, value, emphasized = false, verified = false }: MetricTileProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-2 text-center",
        verified ? "border-emerald-500/25 bg-emerald-500/10" : "border-border/70 bg-muted/30",
        emphasized && !verified && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 tabular-nums font-semibold leading-none",
          emphasized ? "text-2xl" : "text-xl",
          verified ? "text-emerald-900 dark:text-emerald-100" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
};

type MetricStripProps = {
  envelopeNumber: number;
  seriesNumber: number;
  expectedBooklets: number;
  verified?: boolean;
};

function VerificationMetricStrip({
  envelopeNumber,
  seriesNumber,
  expectedBooklets,
  verified = false,
}: MetricStripProps) {
  return (
    <div className={METRICS_GRID_CLASS}>
      <VerificationMetricTile
        label="Env #"
        value={String(envelopeNumber)}
        verified={verified}
      />
      <VerificationMetricTile
        label="Series"
        value={String(seriesNumber)}
        verified={verified}
      />
      <VerificationMetricTile
        label="Booklets"
        value={expectedBooklets.toLocaleString()}
        emphasized
        verified={verified}
      />
    </div>
  );
}

function VerificationMetricLegend() {
  return (
    <div
      className={cn(
        METRICS_GRID_CLASS,
        "sticky top-0 z-10 border-b border-border/60 bg-background/95 px-0 py-2 backdrop-blur supports-backdrop-filter:bg-background/80",
      )}
      aria-hidden
    >
      {(["Env #", "Series", "Booklets"] as const).map((label) => (
        <p
          key={label}
          className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </p>
      ))}
    </div>
  );
}

function rowActionLabel(row: MarkedScriptReturnRow): string {
  return `envelope ${row.envelope_number}, series ${row.series_number}, ${row.expected_booklets.toLocaleString()} booklets, ${row.school_code}`;
}

type Props = {
  rows: MarkedScriptReturnRow[];
  busyKey: string | null;
  verifyAllBusy: boolean;
  onVerify: (row: MarkedScriptReturnRow) => void;
  onUnverify: (row: MarkedScriptReturnRow) => void;
  className?: string;
};

export function MarkedScriptEnvelopeCards({
  rows,
  busyKey,
  verifyAllBusy,
  onVerify,
  onUnverify,
  className,
}: Props) {
  const totalBooklets = rows.reduce((sum, row) => sum + row.expected_booklets, 0);

  return (
    <div className={cn("space-y-3", className)}>
      {rows.length > 0 ? <VerificationMetricLegend /> : null}
      <ul className="space-y-3">
        {rows.map((row, index) => {
          const isVerified = row.status === "verified";
          const isBusy = busyKey === row.allocation_assignment_id;
          const schoolLabel = `${row.school_code} — ${row.school_name}`;
          const actionLabel = rowActionLabel(row);

          return (
            <li
              key={row.allocation_assignment_id}
              className={cn(
                "rounded-xl border p-3.5 shadow-sm transition-colors max-md:px-3",
                isVerified
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                  : "border-border/60 bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isVerified ? "text-emerald-800/80 dark:text-emerald-200/80" : "text-muted-foreground",
                  )}
                >
                  #{index + 1}
                </span>
                {isVerified ? (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Verified
                  </span>
                ) : (
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                    Pending
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-snug" title={schoolLabel}>
                <span className="font-semibold">{row.school_code}</span>
                <span className={cn("font-normal", isVerified ? "opacity-80" : "text-muted-foreground")}>
                  {" "}
                  — {row.school_name}
                </span>
              </p>
              <div className="mt-3">
                <VerificationMetricStrip
                  envelopeNumber={row.envelope_number}
                  seriesNumber={row.series_number}
                  expectedBooklets={row.expected_booklets}
                  verified={isVerified}
                />
              </div>
              {isVerified ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-11 w-full"
                  disabled={isBusy || verifyAllBusy}
                  aria-label={`Unverify ${actionLabel}`}
                  onClick={() => onUnverify(row)}
                >
                  Unverify
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 min-h-11 w-full"
                  disabled={isBusy || verifyAllBusy}
                  aria-label={`Verify ${actionLabel}`}
                  onClick={() => onVerify(row)}
                >
                  Verify
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <div className="text-center">
            <p className="text-lg font-semibold tabular-nums leading-none text-foreground">
              {rows.length.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Envelope{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold tabular-nums leading-none text-foreground">
              {totalBooklets.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total booklets
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
