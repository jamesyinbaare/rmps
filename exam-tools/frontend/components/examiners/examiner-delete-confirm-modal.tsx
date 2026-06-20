"use client";

import { AlertTriangle, UserMinus } from "lucide-react";
import { useEffect, useId, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDestructive =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

type ManualAllocation = {
  subject_code: string;
  subject_name: string;
  paper_number: number;
  script_count: number;
};

type EnvelopeAssignment = {
  allocation_name: string;
  subject_code: string;
  paper_number: number;
  school_name: string;
  envelope_number: number;
  booklet_count: number;
};

type AllocationCampaign = {
  allocation_name: string;
  subject_code: string;
  paper_number: number;
};

type DeleteMode = "roster" | "invitation" | "invitation-and-roster";

type Props = {
  examinerName: string;
  subjectLabel?: string;
  examinerTypeLabel?: string;
  rosterSource?: "manual" | "invitation";
  deleteMode?: DeleteMode;
  manualAllocations: ManualAllocation[];
  envelopeAssignments: EnvelopeAssignment[];
  allocationCampaigns: AllocationCampaign[];
  totalManualScripts: number;
  totalEnvelopes: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function buildImpactSummary(
  totalEnvelopes: number,
  totalManualScripts: number,
  allocationCampaigns: AllocationCampaign[],
): string {
  const parts: string[] = [];
  if (totalEnvelopes > 0) {
    parts.push(
      `${totalEnvelopes} envelope${totalEnvelopes === 1 ? "" : "s"} will become unassigned`,
    );
  }
  if (totalManualScripts > 0) {
    parts.push(
      `${totalManualScripts} manual script count${totalManualScripts === 1 ? "" : "s"} will be cleared`,
    );
  }
  if (allocationCampaigns.length > 0) {
    parts.push(
      `removed from ${allocationCampaigns.length} allocation campaign${allocationCampaigns.length === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

export function ExaminerDeleteConfirmModal({
  examinerName,
  subjectLabel,
  examinerTypeLabel,
  rosterSource,
  deleteMode = "roster",
  manualAllocations,
  envelopeAssignments,
  allocationCampaigns,
  totalManualScripts,
  totalEnvelopes,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  const hasAllocationImpact =
    manualAllocations.length > 0 ||
    envelopeAssignments.length > 0 ||
    allocationCampaigns.length > 0;

  const title =
    deleteMode === "invitation-and-roster"
      ? "Remove examiner & invitation?"
      : deleteMode === "invitation"
        ? "Delete invitation?"
        : "Remove from roster?";

  const confirmLabel =
    deleteMode === "invitation-and-roster"
      ? "Remove & delete invitation"
      : deleteMode === "invitation"
        ? "Delete invitation"
        : "Remove from roster";

  const impactSummary = useMemo(
    () => buildImpactSummary(totalEnvelopes, totalManualScripts, allocationCampaigns),
    [allocationCampaigns, totalEnvelopes, totalManualScripts],
  );

  const removesLinkedInvitation =
    deleteMode === "invitation-and-roster" || rosterSource === "invitation";

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
        aria-label="Cancel removal"
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
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{examinerName}</p>
              {(subjectLabel || examinerTypeLabel) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {subjectLabel ? (
                    <Badge variant="secondary" className="font-normal">
                      {subjectLabel}
                    </Badge>
                  ) : null}
                  {examinerTypeLabel ? (
                    <Badge variant="outline" className="font-normal">
                      {examinerTypeLabel}
                    </Badge>
                  ) : null}
                  {rosterSource === "invitation" && deleteMode === "roster" ? (
                    <Badge variant="outline" className="font-normal">
                      Via invitation
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {hasAllocationImpact ? (
            <>
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
                <p className="font-medium">This will clear existing allocation data</p>
                <p className="mt-1 text-destructive/90">{impactSummary}.</p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {totalEnvelopes > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-center">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{totalEnvelopes}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Envelope{totalEnvelopes === 1 ? "" : "s"}
                    </p>
                  </div>
                ) : null}
                {totalManualScripts > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-center">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{totalManualScripts}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Manual scripts
                    </p>
                  </div>
                ) : null}
                {allocationCampaigns.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-center">
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {allocationCampaigns.length}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Campaign{allocationCampaigns.length === 1 ? "" : "s"}
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {deleteMode === "invitation-and-roster"
                ? "This removes the examiner from the roster and deletes their invitation record. This cannot be undone."
                : deleteMode === "invitation"
                  ? "This permanently deletes the invitation. The invitee will no longer be able to use their portal link. This cannot be undone."
                  : "This removes the examiner from this examination roster. This cannot be undone."}
            </p>
          )}

          {removesLinkedInvitation && deleteMode === "roster" ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Invitation record</p>
              <p className="mt-0.5 text-amber-900/90 dark:text-amber-100/90">
                The linked invitation will also be removed from the invitations list, so the portal
                link will no longer work.
              </p>
            </div>
          ) : null}

          {manualAllocations.length > 0 ? (
            <section className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Manual script counts
              </h3>
              <ul className="space-y-1.5 text-sm">
                {manualAllocations.map((row) => (
                  <li
                    key={`${row.subject_code}-${row.paper_number}`}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <span className="font-medium text-foreground">
                      {row.subject_code} · Paper {row.paper_number}
                    </span>
                    <span className="text-muted-foreground"> — {row.script_count} scripts</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {envelopeAssignments.length > 0 ? (
            <section className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned envelopes
              </h3>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
                {envelopeAssignments.map((row, index) => (
                  <li
                    key={`${row.allocation_name}-${row.school_name}-${row.envelope_number}-${index}`}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <div className="font-medium text-foreground">
                      {row.allocation_name} · {row.subject_code} P{row.paper_number}
                    </div>
                    <div className="text-muted-foreground">
                      {row.school_name} · Envelope {row.envelope_number} · {row.booklet_count} booklet
                      {row.booklet_count === 1 ? "" : "s"}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {allocationCampaigns.length > 0 ? (
            <section className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Allocation campaign membership
              </h3>
              <ul className="space-y-1.5 text-sm">
                {allocationCampaigns.map((row) => (
                  <li
                    key={row.allocation_name}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    {row.allocation_name} · {row.subject_code} P{row.paper_number}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
