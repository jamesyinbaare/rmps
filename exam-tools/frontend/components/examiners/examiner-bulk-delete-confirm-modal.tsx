"use client";

import { AlertTriangle, UserMinus } from "lucide-react";
import { useEffect, useId, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDestructive =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

type Props = {
  mode: "roster" | "invitations";
  selectedCount: number;
  selectedNames: string[];
  pendingCount?: number;
  acceptedCount?: number;
  requiresConfirmation: boolean;
  totalManualScripts: number;
  totalEnvelopes: number;
  allocationCampaignCount: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExaminerBulkDeleteConfirmModal({
  mode,
  selectedCount,
  selectedNames,
  pendingCount = 0,
  acceptedCount = 0,
  requiresConfirmation,
  totalManualScripts,
  totalEnvelopes,
  allocationCampaignCount,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  const hasAllocationImpact =
    requiresConfirmation &&
    (totalManualScripts > 0 || totalEnvelopes > 0 || allocationCampaignCount > 0);

  const title =
    mode === "invitations" ? `Delete ${selectedCount} invitation(s)?` : `Remove ${selectedCount} examiner(s)?`;

  const confirmLabel =
    mode === "invitations"
      ? `Delete ${selectedCount} invitation${selectedCount === 1 ? "" : "s"}`
      : `Remove ${selectedCount} examiner${selectedCount === 1 ? "" : "s"}`;

  const namePreview = useMemo(() => {
    const visible = selectedNames.slice(0, 5);
    const remainder = selectedNames.length - visible.length;
    return { visible, remainder };
  }, [selectedNames]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-110 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(90vh,42rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                hasAllocationImpact
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {hasAllocationImpact ? (
                <AlertTriangle className="size-5" aria-hidden />
              ) : (
                <UserMinus className="size-5" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
                {title}
              </h2>
              {mode === "invitations" && (pendingCount > 0 || acceptedCount > 0) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pendingCount > 0 ? (
                    <Badge variant="secondary" className="font-normal">
                      {pendingCount} pending
                    </Badge>
                  ) : null}
                  {acceptedCount > 0 ? (
                    <Badge variant="outline" className="font-normal">
                      {acceptedCount} on roster
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-1.5 text-sm">
            {namePreview.visible.map((name) => (
              <li key={name} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 font-medium">
                {name}
              </li>
            ))}
          </ul>
          {namePreview.remainder > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              and {namePreview.remainder} more…
            </p>
          ) : null}

          {hasAllocationImpact ? (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
              <p className="font-medium">This will clear existing allocation data</p>
              <p className="mt-1 text-destructive/90">
                {totalEnvelopes > 0
                  ? `${totalEnvelopes} envelope${totalEnvelopes === 1 ? "" : "s"} will become unassigned`
                  : null}
                {totalEnvelopes > 0 && totalManualScripts > 0 ? " · " : null}
                {totalManualScripts > 0
                  ? `${totalManualScripts} manual script count${totalManualScripts === 1 ? "" : "s"} will be cleared`
                  : null}
                {allocationCampaignCount > 0
                  ? `${totalEnvelopes > 0 || totalManualScripts > 0 ? " · " : ""}removed from ${allocationCampaignCount} allocation campaign${allocationCampaignCount === 1 ? "" : "s"}`
                  : null}
                .
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {mode === "invitations"
                ? "Selected invitations will be permanently deleted. Accepted invitations will also remove the linked roster examiner. This cannot be undone."
                : "Selected examiners will be removed from this examination roster. Linked invitations will also be removed. This cannot be undone."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={btnDestructive} disabled={busy} onClick={onConfirm}>
            {busy ? "Removing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
