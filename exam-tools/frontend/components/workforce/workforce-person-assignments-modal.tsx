"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cancelWorkforceAssignmentBatch,
  completeWorkforceAssignmentBatch,
  type Subject,
  type WorkforceAssignmentBatchRow,
  type WorkforceAssignmentBatchStatus,
  type WorkforceAssignmentPersonRow,
} from "@/lib/api";
import { subjectDisplayLabel } from "@/lib/subject-display";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  config: WorkforceKindConfig;
  examId: number;
  subjects: Subject[];
  person: WorkforceAssignmentPersonRow | null;
  canCancelBatch?: boolean;
  onUpdated: () => void | Promise<void>;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function workUnitLabel(kind: WorkforceKindConfig["kind"]): string {
  return kind === "data-entry-clerk" ? "entries" : "scripts";
}

function BatchStatusBadge({ status }: { status: WorkforceAssignmentBatchStatus }) {
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        Completed
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        Cancelled
      </Badge>
    );
  }
  return <Badge variant="outline">Active</Badge>;
}

type CompleteTarget = {
  batch: WorkforceAssignmentBatchRow;
};

type BatchGroup = {
  key: "active" | "completed" | "cancelled";
  title: string;
  batches: WorkforceAssignmentBatchRow[];
};

type BatchCardProps = {
  batch: WorkforceAssignmentBatchRow;
  subjectLabel: string;
  unit: string;
  busyId: string | null;
  canCancelBatch: boolean;
  onComplete: (batch: WorkforceAssignmentBatchRow) => void;
  onCancel: (batch: WorkforceAssignmentBatchRow) => void;
};

function AssignmentBatchCard({
  batch,
  subjectLabel,
  unit,
  busyId,
  canCancelBatch,
  onComplete,
  onCancel,
}: BatchCardProps) {
  const isActive = batch.status === "active";
  const isBusy = busyId === batch.id;

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-3 text-sm shadow-sm",
        isActive && "border-l-2 border-l-primary bg-primary/3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium leading-snug">
            {subjectLabel} · P{batch.paper_number}
          </p>
          <p className="text-xs text-muted-foreground">
            Batch {batch.batch_sequence} · {batch.script_count.toLocaleString()} {unit}
          </p>
          <p className="text-xs text-muted-foreground">
            Assigned {formatDate(batch.assigned_at)}
            {batch.completed_at ? ` · Completed ${formatDate(batch.completed_at)}` : ""}
          </p>
        </div>
        <BatchStatusBadge status={batch.status} />
      </div>

      {isActive ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="button" className="min-h-10 w-full sm:w-auto" disabled={isBusy} onClick={() => onComplete(batch)}>
            {isBusy ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <Check className="mr-1.5 size-4" aria-hidden />}
            Complete
          </Button>
          {canCancelBatch ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-10 w-full border-destructive/40 text-destructive hover:bg-destructive/5 sm:w-auto"
              disabled={isBusy}
              onClick={() => void onCancel(batch)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

type BatchSectionProps = {
  group: BatchGroup;
  defaultOpen: boolean;
  collapsible: boolean;
  subjectLabel: (subjectId: number) => string;
  unit: string;
  busyId: string | null;
  canCancelBatch: boolean;
  onComplete: (batch: WorkforceAssignmentBatchRow) => void;
  onCancel: (batch: WorkforceAssignmentBatchRow) => void;
};

function AssignmentBatchSection({
  group,
  defaultOpen,
  collapsible,
  subjectLabel,
  unit,
  busyId,
  canCancelBatch,
  onComplete,
  onCancel,
}: BatchSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (group.batches.length === 0) return null;

  const heading = (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {group.title}
        <span className="ml-1.5 font-normal tabular-nums">({group.batches.length})</span>
      </h3>
      {collapsible ? (
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      ) : null}
    </div>
  );

  return (
    <section className="space-y-2">
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left sm:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {heading}
        </button>
      ) : null}
      <div className={cn("px-1 py-1", collapsible && "hidden sm:block")}>{heading}</div>
      <ul className={cn("space-y-2", collapsible && !open && "hidden sm:block")}>
        {group.batches.map((batch) => (
          <li key={batch.id}>
            <AssignmentBatchCard
              batch={batch}
              subjectLabel={subjectLabel(batch.subject_id)}
              unit={unit}
              busyId={busyId}
              canCancelBatch={canCancelBatch}
              onComplete={onComplete}
              onCancel={onCancel}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WorkforcePersonAssignmentsModal({
  open,
  onClose,
  config,
  examId,
  subjects,
  person,
  canCancelBatch = false,
  onUpdated,
}: Props) {
  const titleId = useId();
  const confirmTitleId = useId();
  const unit = workUnitLabel(config.kind);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const sortedBatches = useMemo(() => {
    if (!person) return [];
    return person.batches.slice().sort((a, b) => {
      const subjectA = subjectById.get(a.subject_id);
      const subjectB = subjectById.get(b.subject_id);
      const labelA = subjectA ? subjectDisplayLabel(subjectA) : String(a.subject_id);
      const labelB = subjectB ? subjectDisplayLabel(subjectB) : String(b.subject_id);
      const sd = labelA.localeCompare(labelB);
      if (sd !== 0) return sd;
      if (a.paper_number !== b.paper_number) return a.paper_number - b.paper_number;
      return b.batch_sequence - a.batch_sequence;
    });
  }, [person, subjectById]);

  const batchGroups = useMemo((): BatchGroup[] => {
    const active = sortedBatches.filter((b) => b.status === "active");
    const completed = sortedBatches.filter((b) => b.status === "completed");
    const cancelled = sortedBatches.filter((b) => b.status === "cancelled");
    return [
      { key: "active", title: "Active", batches: active },
      { key: "completed", title: "Completed", batches: completed },
      { key: "cancelled", title: "Cancelled", batches: cancelled },
    ];
  }, [sortedBatches]);

  const refresh = useCallback(async () => {
    await onUpdated();
  }, [onUpdated]);

  if (!open || person == null) return null;

  function subjectLabel(subjectId: number): string {
    const subject = subjectById.get(subjectId);
    return subject ? subjectDisplayLabel(subject) : `Subject #${subjectId}`;
  }

  async function handleComplete(batch: WorkforceAssignmentBatchRow) {
    setBusyId(batch.id);
    setError(null);
    try {
      await completeWorkforceAssignmentBatch(config.kind, examId, batch.subject_id, batch.id);
      setCompleteTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(batch: WorkforceAssignmentBatchRow) {
    setBusyId(batch.id);
    setError(null);
    try {
      await cancelWorkforceAssignmentBatch(config.kind, examId, batch.subject_id, batch.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <OfficialModal
        titleId={titleId}
        title={`Assignments — ${person.name}`}
        subtitle={
          <span className="text-sm text-muted-foreground">
            {person.assigned_total.toLocaleString()} total · {person.completed_total.toLocaleString()} completed ·{" "}
            {person.uncompleted_total.toLocaleString()} uncompleted
          </span>
        }
        onRequestClose={onClose}
        formError={error}
        mobileFillHeight
        footer={
          <div className={officialModalFooterClass()}>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        {sortedBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet for this person.</p>
        ) : (
          <div className="space-y-4">
            {batchGroups.map((group) => (
              <AssignmentBatchSection
                key={group.key}
                group={group}
                defaultOpen={group.key === "active" || group.batches.length <= 3}
                collapsible={group.key !== "active" && group.batches.length > 0}
                subjectLabel={subjectLabel}
                unit={unit}
                busyId={busyId}
                canCancelBatch={canCancelBatch}
                onComplete={(batch) => setCompleteTarget({ batch })}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </OfficialModal>

      {completeTarget ? (
        <OfficialModal
          titleId={confirmTitleId}
          title="Mark batch complete?"
          mobileFillHeight
          subtitle={
            <>
              Mark batch {completeTarget.batch.batch_sequence} ({completeTarget.batch.script_count} {unit}) complete for{" "}
              <strong>{person.name}</strong>?
            </>
          }
          onRequestClose={() => setCompleteTarget(null)}
          footer={
            <div className={officialModalFooterClass()}>
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setCompleteTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                disabled={busyId === completeTarget.batch.id}
                onClick={() => void handleComplete(completeTarget.batch)}
              >
                {busyId === completeTarget.batch.id ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="mr-1.5 size-4" aria-hidden />
                )}
                Mark complete
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">
            {subjectLabel(completeTarget.batch.subject_id)} · Paper {completeTarget.batch.paper_number}
          </p>
        </OfficialModal>
      ) : null}
    </>
  );
}
