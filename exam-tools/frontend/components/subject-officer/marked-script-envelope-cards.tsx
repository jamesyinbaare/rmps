"use client";

import { Button } from "@/components/ui/button";
import type { MarkedScriptReturnRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  rows: MarkedScriptReturnRow[];
  busyKey: string | null;
  verifyAllBusy: boolean;
  onVerify: (row: MarkedScriptReturnRow) => void;
  onUnverify: (row: MarkedScriptReturnRow) => void;
};

export function MarkedScriptEnvelopeCards({
  rows,
  busyKey,
  verifyAllBusy,
  onVerify,
  onUnverify,
}: Props) {
  const totalBooklets = rows.reduce((sum, row) => sum + row.expected_booklets, 0);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const isVerified = row.status === "verified";
          const isBusy = busyKey === row.allocation_assignment_id;
          const schoolLabel = `${row.school_code} — ${row.school_name}`;

          return (
            <li
              key={row.allocation_assignment_id}
              className={cn(
                "rounded-lg border border-border/60 p-3 shadow-sm transition-colors",
                isVerified
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                  : "bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span>
                {isVerified ? (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Verified
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug" title={schoolLabel}>
                <span className="font-semibold">{row.school_code}</span>
                <span className="font-normal text-muted-foreground"> — {row.school_name}</span>
              </p>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                Env {row.envelope_number} · Series {row.series_number} ·{" "}
                {row.expected_booklets.toLocaleString()} booklet
                {row.expected_booklets === 1 ? "" : "s"}
              </p>
              {isVerified ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={isBusy || verifyAllBusy}
                  aria-label={`Unverify envelope ${row.envelope_number}, series ${row.series_number}, ${row.school_code}`}
                  onClick={() => onUnverify(row)}
                >
                  Unverify
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={isBusy || verifyAllBusy}
                  aria-label={`Verify envelope ${row.envelope_number}, series ${row.series_number}, ${row.school_code}`}
                  onClick={() => onVerify(row)}
                >
                  Verify
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-semibold text-foreground">
        {rows.length.toLocaleString()} envelope{rows.length === 1 ? "" : "s"} ·{" "}
        {totalBooklets.toLocaleString()} total booklets
      </p>
    </div>
  );
}
