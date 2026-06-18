"use client";

import { useEffect, useId } from "react";

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

type Props = {
  examinerName: string;
  manualAllocations: ManualAllocation[];
  envelopeAssignments: EnvelopeAssignment[];
  allocationCampaigns: AllocationCampaign[];
  totalManualScripts: number;
  totalEnvelopes: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function buildSummary(
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
      `${totalManualScripts} manual script count${totalManualScripts === 1 ? "" : "s"} will be removed`,
    );
  }
  if (allocationCampaigns.length > 0) {
    parts.push(
      `removed from ${allocationCampaigns.length} allocation campaign${allocationCampaigns.length === 1 ? "" : "s"}`,
    );
  }
  if (parts.length === 0) return "This examiner has related allocation data that will be cleared.";
  return `${parts.join("; ")}.`;
}

export function ExaminerDeleteConfirmModal({
  examinerName,
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
  const summary = buildSummary(totalEnvelopes, totalManualScripts, allocationCampaigns);

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
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel removal"
        className="absolute inset-0 bg-foreground/40"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            Remove {examinerName} from roster?
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{summary}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {manualAllocations.length > 0 ? (
            <section className="space-y-2">
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
            <section className={manualAllocations.length > 0 ? "mt-4 space-y-2" : "space-y-2"}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned envelopes
              </h3>
              <ul className="space-y-1.5 text-sm">
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
            <section
              className={
                manualAllocations.length > 0 || envelopeAssignments.length > 0 ? "mt-4 space-y-2" : "space-y-2"
              }
            >
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
            {busy ? "Removing…" : "Remove examiner"}
          </button>
        </div>
      </div>
    </div>
  );
}
