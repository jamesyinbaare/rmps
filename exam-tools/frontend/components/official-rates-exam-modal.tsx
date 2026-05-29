"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  X,
} from "lucide-react";

import { DiscardChangesConfirmModal } from "@/components/discard-changes-confirm-modal";
import { OfficialRatesCopyModal } from "@/components/official-rates-copy-modal";
import { OfficialRatesFormulaCallout } from "@/components/official-rates-formula-callout";
import {
  getExaminationDesignationRates,
  putExaminationDesignationRates,
  type Examination,
} from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  buildSavePayload,
  countConfiguredDesignations,
  formatExamLabel,
  isDailyRateConfigured,
  rowToDraft,
  serializeOfficialRatesRows,
  type OfficialRatesAmountField,
  type OfficialRatesDraftRow,
  type OfficialRatesRowErrors,
} from "@/lib/official-rates-draft";
import {
  officialAccountsBtnPrimary,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const rateAmountInputClass =
  "h-9 w-full min-w-[4.5rem] rounded-md border border-input-border bg-input px-2 text-right text-sm tabular-nums text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

type Props = {
  exam: Examination;
  allExams: Examination[];
  onClose: () => void;
  onSaved?: () => void;
};

export function OfficialRatesExamModal({ exam, allExams, onClose, onSaved }: Props) {
  const titleId = useId();
  const editToggleId = useId();

  const [rows, setRows] = useState<OfficialRatesDraftRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<OfficialRatesRowErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDisableEdit, setPendingDisableEdit] = useState(false);

  const examLabel = formatExamLabel(exam);

  const dirty = useMemo(() => {
    if (!savedSnapshot || !editing) return false;
    return serializeOfficialRatesRows(rows) !== savedSnapshot;
  }, [rows, savedSnapshot, editing]);

  const configuredCount = useMemo(() => countConfiguredDesignations(rows), [rows]);

  const applyRatesFromApi = useCallback((items: OfficialRatesDraftRow[]) => {
    const snapshot = serializeOfficialRatesRows(items);
    setRows(items);
    setSavedSnapshot(snapshot);
    setRowErrors({});
    setSaveError(null);
  }, []);

  const loadRates = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const data = await getExaminationDesignationRates(exam.id);
      applyRatesFromApi(data.items.map(rowToDraft));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We could not load these rates. Please try again.");
      setRows([]);
      setSavedSnapshot("");
    } finally {
      setBusy(false);
    }
  }, [applyRatesFromApi, exam.id]);

  useEffect(() => {
    void loadRates();
    setEditing(false);
  }, [loadRates, exam.id]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setPendingClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = window.setTimeout(() => setSaveSuccess(false), 4000);
    return () => window.clearTimeout(t);
  }, [saveSuccess]);

  function requestDisableEdit() {
    if (dirty) {
      setPendingDisableEdit(true);
      return;
    }
    setEditing(false);
    setSaveError(null);
    setRowErrors({});
  }

  function updateRow(designation: string, field: OfficialRatesAmountField, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.designation === designation ? { ...r, [field]: value } : r)),
    );
    setRowErrors((prev) => {
      const next = { ...prev };
      if (next[designation]) {
        const fields = { ...next[designation] };
        delete fields[field];
        if (Object.keys(fields).length === 0) delete next[designation];
        else next[designation] = fields;
      }
      return next;
    });
    setSaveSuccess(false);
  }

  async function onSave() {
    setSaveError(null);
    const { items, rowErrors: validationErrors } = buildSavePayload(rows);
    if (Object.keys(validationErrors).length > 0) {
      setRowErrors(validationErrors);
      setSaveError("Please correct the amounts marked in red, then save again.");
      return;
    }
    setSaving(true);
    try {
      const data = await putExaminationDesignationRates(exam.id, items);
      applyRatesFromApi(data.items.map(rowToDraft));
      setSaveSuccess(true);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function onCancelEdit() {
    if (dirty) {
      setPendingDisableEdit(true);
      return;
    }
    void loadRates();
    setEditing(false);
  }

  async function onCopyFromExam(sourceExamId: number) {
    setCopyBusy(true);
    try {
      const data = await getExaminationDesignationRates(sourceExamId);
      const byDesignation = new Map(data.items.map((item) => [item.designation, item]));
      setRows((prev) =>
        prev.map((row) => {
          const src = byDesignation.get(row.designation);
          if (!src) return row;
          return {
            designation: row.designation,
            daily_rate_ghs: src.daily_rate_ghs ?? "",
            commuting_allowance_ghs: src.commuting_allowance_ghs ?? "",
            airtime_ghs: src.airtime_ghs ?? "",
          };
        }),
      );
      setRowErrors({});
      setCopyModalOpen(false);
      setSaveSuccess(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "We could not copy those rates. Please try again.");
    } finally {
      setCopyBusy(false);
    }
  }

  function discardAndClose() {
    setPendingClose(false);
    onClose();
  }

  function discardAndDisableEdit() {
    setPendingDisableEdit(false);
    void loadRates();
    setEditing(false);
    setSaveError(null);
    setRowErrors({});
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-foreground/40"
          onClick={requestClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
                Allowance rates
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{examLabel}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Close"
              onClick={requestClose}
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="shrink-0 space-y-3 border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={editToggleId}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">
                  {editing ? "Change rates" : "View rates"}
                </span>
                <button
                  id={editToggleId}
                  type="button"
                  role="switch"
                  aria-checked={editing}
                  disabled={busy}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50",
                    editing ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                  onClick={() => {
                    if (editing) requestDisableEdit();
                    else setEditing(true);
                  }}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform",
                      editing ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
                {!editing ? (
                  <Pencil className="size-4 text-muted-foreground" aria-hidden />
                ) : null}
              </label>
            </div>

            {editing ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Nothing is saved until you choose Save. If you leave without saving, your changes will be lost.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  Changes not saved yet
                </span>
              ) : saveSuccess ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Saved successfully
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {busy
                    ? "Loading…"
                    : `${configuredCount} of ${rows.length || 6} roles have a daily rate`}
                </span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
            {loadError ? (
              <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </p>
            ) : null}
            {saveError ? (
              <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </p>
            ) : null}

            {busy ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Loading allowance rates…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="px-2 py-2 text-left font-semibold">Designation</th>
                      <th className="px-2 py-2 text-right font-semibold tabular-nums" title="Paid for each day worked">
                        Daily rate
                      </th>
                      <th className="px-2 py-2 text-right font-semibold tabular-nums" title="Paid for each day worked">
                        Commuting (per day)
                      </th>
                      <th className="px-2 py-2 text-right font-semibold tabular-nums" title="Paid once per official">
                        Airtime
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {rows.map((row) => {
                      const complete = isDailyRateConfigured(row);
                      const errors = rowErrors[row.designation];
                      return (
                        <tr
                          key={row.designation}
                          className={cn(!complete && !editing && "bg-amber-500/5")}
                        >
                          <td className="px-2 py-2 align-middle text-left">
                            <div className="font-medium">{row.designation}</div>
                            {!complete && !editing ? (
                              <span className="text-xs text-amber-700 dark:text-amber-300">
                                Daily rate not set
                              </span>
                            ) : null}
                          </td>
                          <RateCell
                            editing={editing}
                            designation={row.designation}
                            field="daily_rate_ghs"
                            value={row.daily_rate_ghs}
                            placeholder="Enter amount"
                            error={errors?.daily_rate_ghs}
                            onChange={updateRow}
                          />
                          <RateCell
                            editing={editing}
                            designation={row.designation}
                            field="commuting_allowance_ghs"
                            value={row.commuting_allowance_ghs}
                            placeholder="—"
                            error={errors?.commuting_allowance_ghs}
                            onChange={updateRow}
                          />
                          <RateCell
                            editing={editing}
                            designation={row.designation}
                            field="airtime_ghs"
                            value={row.airtime_ghs}
                            placeholder="—"
                            error={errors?.airtime_ghs}
                            onChange={updateRow}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <OfficialRatesFormulaCallout className="mt-4" />
          </div>

          <div className="shrink-0 border-t border-border bg-muted/10 px-4 py-4 sm:px-5">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {editing ? (
                <>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={saving || allExams.length < 2}
                    onClick={() => setCopyModalOpen(true)}
                  >
                    <Copy className="mr-1.5 inline size-4" aria-hidden />
                    Use rates from another exam
                  </button>
                  <button type="button" className={btnSecondary} disabled={saving} onClick={onCancelEdit}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={officialAccountsBtnPrimary}
                    disabled={saving || !dirty}
                    onClick={() => void onSave()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button type="button" className={btnSecondary} onClick={requestClose}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingClose ? (
        <DiscardChangesConfirmModal onCancel={() => setPendingClose(false)} onConfirm={discardAndClose} />
      ) : null}

      {pendingDisableEdit ? (
        <DiscardChangesConfirmModal
          onCancel={() => setPendingDisableEdit(false)}
          onConfirm={discardAndDisableEdit}
        />
      ) : null}

      {copyModalOpen ? (
        <OfficialRatesCopyModal
          exams={allExams}
          currentExamId={exam.id}
          busy={copyBusy}
          onCancel={() => setCopyModalOpen(false)}
          onConfirm={(id) => void onCopyFromExam(id)}
        />
      ) : null}
    </>
  );
}

type RateCellProps = {
  editing: boolean;
  designation: string;
  field: OfficialRatesAmountField;
  value: string;
  placeholder: string;
  error?: string;
  onChange: (designation: string, field: OfficialRatesAmountField, value: string) => void;
};

function RateCell({ editing, designation, field, value, placeholder, error, onChange }: RateCellProps) {
  const inputId = `${designation}-${field}`.replace(/\s+/g, "-");
  if (!editing) {
    return (
      <td className="px-2 py-2 align-middle text-right tabular-nums text-foreground">
        {value.trim() ? formatGhsAmount(value) : "—"}
      </td>
    );
  }
  return (
    <td className="px-2 py-2 align-top">
      <div className="flex items-center justify-end gap-1">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          className={cn(rateAmountInputClass, error && "border-destructive")}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(designation, field, e.target.value)}
        />
        <span className="shrink-0 text-xs text-muted-foreground">GHS</span>
      </div>
      {error ? <p className="mt-1 text-right text-xs text-destructive">{error}</p> : null}
    </td>
  );
}
