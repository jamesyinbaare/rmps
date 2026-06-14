"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  WORKFORCE_PAPER_OPTIONS,
  createWorkforceAssignmentBatch,
  type Subject,
  type WorkforceAssignmentPersonRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { subjectDisplayLabel } from "@/lib/subject-display";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

const quantityInputClass = cn(
  formInputClass,
  "h-9 w-full max-w-none px-2 tabular-nums sm:max-w-xs [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

type Props = {
  open: boolean;
  onClose: () => void;
  config: WorkforceKindConfig;
  examId: number;
  subjects: Subject[];
  lockedSubjectIds?: number[];
  person: WorkforceAssignmentPersonRow | null;
  onAssigned: () => void | Promise<void>;
};

function workUnitLabel(kind: WorkforceKindConfig["kind"]): string {
  return kind === "data-entry-clerk" ? "entries" : "scripts";
}

export function WorkforceAssignBatchModal({
  open,
  onClose,
  config,
  examId,
  subjects,
  lockedSubjectIds,
  person,
  onAssigned,
}: Props) {
  const titleId = useId();
  const unit = workUnitLabel(config.kind);

  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [paperNumber, setPaperNumber] = useState<number>(1);
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopedSubjects = useMemo(() => {
    const base =
      lockedSubjectIds && lockedSubjectIds.length > 0
        ? subjects.filter((s) => lockedSubjectIds.includes(s.id))
        : subjects;
    if (subjectTypeFilter === "all") return base;
    return base.filter((s) => s.subject_type === subjectTypeFilter);
  }, [lockedSubjectIds, subjectTypeFilter, subjects]);

  const subjectOptions = useMemo(() => {
    return scopedSubjects
      .slice()
      .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)))
      .map((s) => ({ value: String(s.id), label: subjectDisplayLabel(s) }));
  }, [scopedSubjects]);

  useEffect(() => {
    if (!open) return;
    setSubjectTypeFilter("all");
    setPaperNumber(1);
    setQuantity("");
    setError(null);
  }, [open, person?.id]);

  useEffect(() => {
    if (!open) return;
    if (subjectOptions.length === 0) {
      setSubjectId(null);
      return;
    }
    if (subjectId == null || !subjectOptions.some((opt) => opt.value === String(subjectId))) {
      setSubjectId(Number(subjectOptions[0]!.value));
    }
  }, [open, subjectId, subjectOptions]);

  if (!open || person == null) return null;

  const canAssign = person.availability_status === "confirmed";

  async function handleSubmit() {
    if (subjectId == null) {
      setError("Select a subject.");
      return;
    }
    const count = Number.parseInt(quantity.trim(), 10);
    if (!Number.isFinite(count) || count < 1) {
      setError(`Enter a valid ${unit} count (at least 1).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createWorkforceAssignmentBatch(config.kind, examId, subjectId, paperNumber, person!.id, count);
      await onAssigned();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OfficialModal
      titleId={titleId}
      title={`Assign ${unit} — ${person.name}`}
      onRequestClose={onClose}
      formError={error}
      mobileFillHeight
      footer={
        <div className={officialModalFooterClass()}>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:min-h-10 sm:w-auto"
            disabled={!canAssign || busy || subjectId == null}
            onClick={() => void handleSubmit()}
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : null}
            Assign
          </Button>
        </div>
      }
    >
      {!canAssign ? (
        <p className="mb-4 text-sm text-muted-foreground">
          This person must confirm availability via SMS before you can assign {unit}.
        </p>
      ) : null}

      <div className="space-y-4">
        <div>
          <label className={formLabelClass} htmlFor="assign-subject-type">
            Subject type
          </label>
          <select
            id="assign-subject-type"
            className={formInputClass}
            value={subjectTypeFilter}
            disabled={!canAssign}
            onChange={(e) => setSubjectTypeFilter(e.target.value as ScriptControlSubjectTypeFilter)}
          >
            {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={formLabelClass} htmlFor="assign-subject">
            Subject
          </label>
          <SearchableCombobox
            id="assign-subject"
            options={subjectOptions}
            value={subjectId != null ? String(subjectId) : ""}
            onChange={(v) => setSubjectId(v ? Number(v) : null)}
            placeholder="Select subject…"
            searchPlaceholder="Search subject…"
            showAllOption={false}
            disabled={!canAssign || subjectOptions.length === 0}
            emptyText={
              subjectOptions.length === 0
                ? subjectTypeFilter === "all"
                  ? "No subjects available"
                  : `No ${subjectTypeFilter.toLowerCase()} subjects`
                : "No match"
            }
          />
        </div>

        <div>
          <p className={cn(formLabelClass, "mb-1.5")}>Paper</p>
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {WORKFORCE_PAPER_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!canAssign}
                onClick={() => setPaperNumber(p)}
                className={cn(
                  "min-h-11 min-w-11 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5",
                  paperNumber === p
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground",
                )}
              >
                P{p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={formLabelClass} htmlFor="assign-quantity">
            Quantity
          </label>
          <input
            id="assign-quantity"
            type="number"
            min={1}
            className={quantityInputClass}
            value={quantity}
            disabled={!canAssign || busy}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAssign) void handleSubmit();
            }}
            placeholder="Enter quantity"
          />
        </div>
      </div>
    </OfficialModal>
  );
}
