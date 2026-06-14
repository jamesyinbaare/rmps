"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BankBranchBulkUploadResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  result: BankBranchBulkUploadResponse;
  onDismiss: () => void;
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: "default" | "success" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5",
        (!tone || tone === "default") && "border-border/70 bg-muted/15",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

export function BankDirectoryUploadResult({ result, onDismiss }: Props) {
  const hasErrors = result.failed > 0;
  const allGood = result.failed === 0 && result.successful > 0;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-sm",
        allGood && "border-emerald-500/40",
        hasErrors && "border-amber-500/40",
        !allGood && !hasErrors && "border-border",
      )}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {allGood ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          ) : hasErrors ? (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {allGood
                ? "Upload completed"
                : hasErrors
                  ? "Upload finished with issues"
                  : "Upload finished"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {allGood
                ? "Your spreadsheet was processed and the directory has been refreshed."
                : hasErrors
                  ? "Some rows could not be imported. Review the errors below and fix your file."
                  : "No rows were imported from this file."}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Dismiss" onClick={onDismiss}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-5 sm:px-5">
        <Stat label="Rows in file" value={result.total_rows} />
        <Stat label="Imported" value={result.successful} tone={result.successful > 0 ? "success" : undefined} />
        <Stat label="Created" value={result.created} />
        <Stat label="Updated" value={result.updated} />
        <Stat label="Errors" value={result.failed} tone={result.failed > 0 ? "warning" : undefined} />
      </div>

      {result.errors.length > 0 ? (
        <div className="border-t border-border/70 px-4 py-4 sm:px-5">
          <p className="text-xs font-medium text-foreground">Row errors</p>
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium text-muted-foreground">Row</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Issue</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((er, i) => (
                  <tr key={`${er.row_number}-${i}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 tabular-nums text-foreground">{er.row_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">{er.error_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
