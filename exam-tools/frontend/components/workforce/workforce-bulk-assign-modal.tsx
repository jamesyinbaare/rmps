"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { FormSection, OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import { upsertScriptCheckerBulkAssignment, type WorkforceAssignmentPersonRow } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const FORM_ID = "workforce-bulk-assign-form";

const quantityInputClass = cn(
  formInputClass,
  "mt-1.5 h-11 w-full tabular-nums [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

type Props = {
  open: boolean;
  onClose: () => void;
  examId: number;
  person: WorkforceAssignmentPersonRow | null;
  onSaved: () => void | Promise<void>;
};

function parseNonNegInt(raw: string, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: 0 };
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `Enter a valid ${label} count (0 or more).` };
  }
  return { ok: true, value: n };
}

function parseOptionalNonNeg(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function WorkforceBulkAssignModal({ open, onClose, examId, person, onSaved }: Props) {
  const titleId = useId();
  const subtitleId = useId();
  const existing = person?.bulk_assignment ?? null;
  const isEdit = existing != null;

  const [paper1, setPaper1] = useState("");
  const [paper2, setPaper2] = useState("");
  const [numDays, setNumDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaper1(existing != null ? String(existing.paper1_script_count) : "");
    setPaper2(existing != null ? String(existing.paper2_script_count) : "");
    setNumDays(existing != null ? String(existing.num_days) : "");
    setError(null);
  }, [existing, open, person?.id]);

  const liveTotal = useMemo(() => {
    const p1 = parseOptionalNonNeg(paper1);
    const p2 = parseOptionalNonNeg(paper2);
    if (p1 == null || p2 == null) return null;
    return p1 + p2;
  }, [paper1, paper2]);

  if (!open || person == null) return null;

  const canAssign = person.availability_status === "confirmed";
  const metaParts = [person.reference_code?.trim(), person.phone_number?.trim()].filter(Boolean);

  async function handleSubmit() {
    if (!canAssign) return;
    const p1 = parseNonNegInt(paper1, "Paper 1");
    if (!p1.ok) {
      setError(p1.error);
      return;
    }
    const p2 = parseNonNegInt(paper2, "Paper 2");
    if (!p2.ok) {
      setError(p2.error);
      return;
    }
    if (p1.value + p2.value < 1) {
      setError("Enter at least one script for Paper 1 or Paper 2.");
      return;
    }
    const days = Number.parseInt(numDays.trim(), 10);
    if (!Number.isFinite(days) || days < 1) {
      setError("Enter the number of days at post (at least 1).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertScriptCheckerBulkAssignment(examId, person!.id, p1.value, p2.value, days);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OfficialModal
      titleId={titleId}
      subtitleId={subtitleId}
      title={isEdit ? "Edit assignment" : "Assign scripts"}
      subtitle={
        <span className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{person.name}</span>
          {metaParts.length > 0 ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{metaParts.join(" · ")}</span>
          ) : null}
        </span>
      }
      onRequestClose={onClose}
      formError={error}
      mobileFillHeight
      initialFocusSelector="#bulk-paper1"
      focusNameOnMount={false}
      footer={
        <div className={officialModalFooterClass()}>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            className="min-h-11 w-full sm:min-h-10 sm:w-auto"
            disabled={!canAssign || busy}
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : null}
            {isEdit ? "Save changes" : "Save assignment"}
          </Button>
        </div>
      }
    >
      {!canAssign ? (
        <p className="text-sm text-muted-foreground">
          This checker must confirm availability via SMS before you can assign scripts.
        </p>
      ) : (
        <form
          id={FORM_ID}
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <FormSection
            title="Scripts marked"
            description="Exam-wide totals for this checker. Paper 1 and Paper 2 are separate — do not split by subject."
          >
            <div>
              <label className={formLabelClass} htmlFor="bulk-paper1">
                Paper 1
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">Objective scripts</p>
              <input
                id="bulk-paper1"
                type="number"
                inputMode="numeric"
                min={0}
                className={quantityInputClass}
                value={paper1}
                disabled={busy}
                onChange={(e) => setPaper1(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="0"
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="bulk-paper2">
                Paper 2
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">Subjective scripts</p>
              <input
                id="bulk-paper2"
                type="number"
                inputMode="numeric"
                min={0}
                className={quantityInputClass}
                value={paper2}
                disabled={busy}
                onChange={(e) => setPaper2(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total scripts</span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {liveTotal == null ? "—" : liveTotal.toLocaleString()}
              </span>
            </div>
          </FormSection>

          <FormSection
            title="Days at post"
            description="Total days the checker came to work. Used for T&T and lunch allowances, not script pay."
          >
            <div className="md:col-span-2">
              <label className={formLabelClass} htmlFor="bulk-days">
                Days
              </label>
              <input
                id="bulk-days"
                type="number"
                inputMode="numeric"
                min={1}
                className={cn(quantityInputClass, "sm:max-w-40")}
                value={numDays}
                disabled={busy}
                onChange={(e) => setNumDays(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="e.g. 5"
              />
            </div>
          </FormSection>
        </form>
      )}
    </OfficialModal>
  );
}
