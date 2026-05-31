"use client";

import { useEffect, useRef } from "react";

import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { getPaperInspectorVisuals, seriesInspectorBadgeClass } from "@/lib/paper-inspector-styles";
import {
  consecutiveEnvelopeNumbersMessage,
  draftIsNoScripts,
  emptyDraft,
  envelopesToPersist,
  initialDraftForEdit,
  isConsecutiveFromOne,
  maxBookletsForPaper,
  seriesSlotKey,
  type ScriptControlDraft,
} from "@/lib/script-control-editor";
import {
  noScriptsEnvelope1Hint,
  noScriptsSeriesEditHint,
  noScriptsSeriesSummary,
  packingCountFieldLabel,
  packingItemPlural,
} from "@/lib/script-packing-terms";
import type {
  MySchoolScriptControlResponse,
  ScriptSeriesPackingResponse,
  ScriptSeriesSlotResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium hover:bg-muted";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive hover:bg-destructive/10";

export type SeriesEditHandlers = {
  onSave: (
    subjectId: number,
    paperNumber: number,
    seriesNumber: number,
    draft: ScriptControlDraft,
    meta: { hadVerified: boolean; hadEnvelopes: boolean },
  ) => Promise<void>;
  onClear: (
    subjectId: number,
    paperNumber: number,
    seriesNumber: number,
    packing: ScriptSeriesPackingResponse | null,
  ) => Promise<void>;
  busy: boolean;
};

type Props = {
  data: MySchoolScriptControlResponse;
  subjectId: number;
  paperNumber: number;
  slot: ScriptSeriesSlotResponse;
  recordType: "regular" | "irregular";
  editingKey: string | null;
  draft: ScriptControlDraft;
  formError: string | null;
  onOpenEdit: (subjectId: number, paperNumber: number, seriesNumber: number, packing: ScriptSeriesPackingResponse | null) => void;
  onCloseEdit: () => void;
  onDraftChange: (draft: ScriptControlDraft) => void;
  onFormError: (msg: string | null) => void;
  handlers: SeriesEditHandlers;
  /** Desktop right-panel layout with larger form chrome. */
  layout?: "inline" | "panel";
};

export function ScriptControlSeriesBlock({
  data,
  subjectId,
  paperNumber,
  slot,
  recordType,
  editingKey,
  draft,
  formError,
  onOpenEdit,
  onCloseEdit,
  onDraftChange,
  onFormError,
  handlers,
  layout = "inline",
}: Props) {
  const packing = slot.packing;
  const key = seriesSlotKey(subjectId, paperNumber, slot.series_number);
  const isPanel = layout === "panel";
  const isEditing = editingKey === key;
  const cap = maxBookletsForPaper(data, paperNumber);
  const paperVisuals = getPaperInspectorVisuals(paperNumber);
  const anyVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
  const firstCountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPanel || !isEditing) return;
    const t = window.setTimeout(() => {
      firstCountRef.current?.focus();
      firstCountRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isEditing, isPanel, key]);

  const toSave = isEditing ? envelopesToPersist(draft) : [];
  const editingNoScripts = isEditing && recordType === "regular" && draftIsNoScripts(draft);
  const orderError =
    isEditing && !editingNoScripts && toSave.length > 0 && !isConsecutiveFromOne(toSave.map((e) => e.envelope_number))
      ? consecutiveEnvelopeNumbersMessage(paperNumber, toSave.map((e) => e.envelope_number))
      : null;

  function addEnvelope() {
    if (draftIsNoScripts(draft)) return;
    const next =
      draft.envelopes.length === 0 ? 1 : Math.max(...draft.envelopes.map((e) => e.envelope_number)) + 1;
    onDraftChange({ envelopes: [...draft.envelopes, { envelope_number: next, booklet_count: null }] });
  }

  function removeEnvelope(idx: number) {
    const env = draft.envelopes[idx];
    if (env?.envelope_number === 1 && draft.envelopes.length === 1) return;
    onDraftChange({ envelopes: draft.envelopes.filter((_, i) => i !== idx) });
  }

  function updateEnvelope(idx: number, booklet_count: number | null) {
    const updated = draft.envelopes.map((e, i) => {
      if (i !== idx) return e;
      return { ...e, booklet_count: booklet_count === null ? null : Math.max(0, booklet_count) };
    });
    const env1 = updated.find((e) => e.envelope_number === 1);
    if (env1?.booklet_count === 0) onDraftChange({ envelopes: [env1] });
    else onDraftChange({ envelopes: updated });
  }

  async function handleSave() {
    onFormError(null);
    if (recordType === "regular" && draftIsNoScripts(draft)) {
      await handlers.onSave(subjectId, paperNumber, slot.series_number, draft, {
        hadVerified: anyVerified,
        hadEnvelopes: Boolean(packing?.envelopes?.length),
      });
      return;
    }
    const persisted = envelopesToPersist(draft);
    if (persisted.length === 0) {
      onFormError("Enter a count for envelope 1, or enter 0 if there is nothing to pack.");
      return;
    }
    if (!isConsecutiveFromOne(persisted.map((e) => e.envelope_number))) {
      onFormError(consecutiveEnvelopeNumbersMessage(paperNumber, persisted.map((e) => e.envelope_number)));
      return;
    }
    for (const env of persisted) {
      if (env.booklet_count > cap) {
        onFormError(`Envelope ${env.envelope_number}: at most ${cap} ${packingItemPlural(paperNumber)}.`);
        return;
      }
    }
    await handlers.onSave(subjectId, paperNumber, slot.series_number, draft, {
      hadVerified: anyVerified,
      hadEnvelopes: Boolean(packing?.envelopes?.length),
    });
  }

  function handleCancel() {
    onCloseEdit();
  }

  return (
    <li className={cn(paperVisuals.seriesRowClass, "list-none", isPanel && "rounded-none border-0 bg-transparent p-0 shadow-none")}>
      <div className={cn(isPanel && "mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3")}>
        <span className={cn(seriesInspectorBadgeClass, isPanel && "text-sm")}>Series {slot.series_number}</span>
        {isPanel ? (
          <div className="flex flex-wrap items-center gap-2">
            {anyVerified ? (
              <span className="text-xs text-amber-700 dark:text-amber-400">Verified — save clears verification</span>
            ) : null}
            {packing ? (
              <button
                type="button"
                className={btnDanger}
                disabled={handlers.busy}
                onClick={() => void handlers.onClear(subjectId, paperNumber, slot.series_number, packing)}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!isPanel ? (
      <div className={cn("mt-2 flex flex-col gap-2", "sm:flex-row sm:justify-between")}>
        <div className={cn("text-xs text-muted-foreground", isPanel && "text-sm")}>
          {!isEditing ? (
            packing?.no_scripts ? (
              noScriptsSeriesSummary(paperNumber)
            ) : packing ? (
              <>
                {packing.envelopes.length} envelope{packing.envelopes.length === 1 ? "" : "s"} ·{" "}
                {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)} {packingItemPlural(paperNumber)}
                {anyVerified ? " · verified" : ""}
              </>
            ) : (
              "Not recorded — add envelope counts for this series."
            )
          ) : null}
          {anyVerified && !isEditing ? (
            <p className="mt-1 text-amber-700 dark:text-amber-400">Verified — editing clears depot verification.</p>
          ) : null}
        </div>
        {!isEditing && !isPanel ? (
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} disabled={handlers.busy} onClick={() => onOpenEdit(subjectId, paperNumber, slot.series_number, packing)}>
              {packing ? "Edit" : "Add"}
            </button>
            {packing ? (
              <button
                type="button"
                className={btnDanger}
                disabled={handlers.busy}
                onClick={() => void handlers.onClear(subjectId, paperNumber, slot.series_number, packing)}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}
      {isPanel && !isEditing ? (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {packing?.no_scripts ? (
              noScriptsSeriesSummary(paperNumber)
            ) : packing ? (
              <>
                {packing.envelopes.length} envelope{packing.envelopes.length === 1 ? "" : "s"} ·{" "}
                {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)} {packingItemPlural(paperNumber)}
                {anyVerified ? " · verified" : ""}
              </>
            ) : (
              "Not recorded — select this series again to enter counts."
            )}
          </div>
          {anyVerified ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Verified — editing clears depot verification.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Select this series again to edit.</p>
        </div>
      ) : null}
      {isEditing ? (
        <div className={cn("mt-3 space-y-4 border-t pt-4", paperVisuals.editDividerClass, isPanel && "border-border")}>
          {(formError || orderError) && <p className="text-sm text-destructive">{formError ?? orderError}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className={formLabelClass}>Envelopes</span>
            <button type="button" className={btnSecondary} disabled={draftIsNoScripts(draft)} onClick={addEnvelope}>
              Add envelope
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Up to {cap} per envelope. {recordType === "regular" ? noScriptsEnvelope1Hint(paperNumber) : ""}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Envelope</th>
                  <th className="px-3 py-2 font-medium">{packingCountFieldLabel(paperNumber)}</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {draft.envelopes.map((env, idx) => (
                  <tr key={env.envelope_number} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium tabular-nums">{env.envelope_number}</td>
                    <td className="px-3 py-2">
                      <input
                        ref={idx === 0 ? firstCountRef : undefined}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className={cn(formInputClass, "max-w-[140px]")}
                        value={env.booklet_count === null ? "" : env.booklet_count}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateEnvelope(idx, v === "" ? null : parseInt(v, 10));
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {env.envelope_number === 1 && draft.envelopes.length === 1 ? null : (
                        <button type="button" className={cn(btnDanger, "min-h-9 px-2 text-xs")} onClick={() => removeEnvelope(idx)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recordType === "regular" &&
          draft.envelopes.some((e) => e.envelope_number === 1 && e.booklet_count === 0) ? (
            <p className="text-sm text-primary">{noScriptsSeriesEditHint(paperNumber)}</p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button type="button" className={btnPrimary} disabled={handlers.busy} onClick={() => void handleSave()}>
              Save
            </button>
            <button type="button" className={btnSecondary} disabled={handlers.busy} onClick={handleCancel}>
              {isPanel ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export { emptyDraft, initialDraftForEdit, seriesSlotKey };
