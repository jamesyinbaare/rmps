"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { formLabelClass } from "@/lib/form-classes";
import { formatExamLabel } from "@/lib/official-rates-draft";
import type { Examination } from "@/lib/api";

const btnSecondary =
  "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:w-auto";
const btnPrimary =
  "inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:w-auto";

type Props = {
  exams: Examination[];
  currentExamId: number;
  onCancel: () => void;
  onConfirm: (sourceExamId: number) => void;
  busy?: boolean;
};

export function OfficialRatesCopyModal({ exams, currentExamId, onCancel, onConfirm, busy }: Props) {
  const titleId = useId();
  const options = useMemo(
    () =>
      exams
        .filter((e) => e.id !== currentExamId)
        .map((e) => ({
          value: String(e.id),
          label: formatExamLabel(e),
        })),
    [exams, currentExamId],
  );
  const [sourceId, setSourceId] = useState(options[0]?.value ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    if (!options.some((o) => o.value === sourceId)) {
      setSourceId(options[0]?.value ?? "");
    }
  }, [options, sourceId]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-foreground/40"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
          Use rates from another exam
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Amounts from the exam you pick will replace what is shown here. You can adjust anything before you save.
        </p>
        <div className="mt-4">
          <label className={formLabelClass} htmlFor="copy-rates-source-exam">
            Copy from
          </label>
          <SearchableCombobox
            options={options}
            value={sourceId}
            onChange={setSourceId}
            placeholder="Choose an exam"
            searchPlaceholder="Search exams…"
            emptyText={options.length ? "No matching exam." : "There are no other exams to copy from."}
            showAllOption={false}
            widthClass="w-full min-w-0"
            disabled={options.length === 0 || busy}
          />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!sourceId || busy}
            onClick={() => onConfirm(Number.parseInt(sourceId, 10))}
          >
            {busy ? "Loading…" : "Apply rates"}
          </button>
        </div>
      </div>
    </div>
  );
}
