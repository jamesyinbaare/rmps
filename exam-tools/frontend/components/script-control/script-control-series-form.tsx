"use client";

import { ScriptControlEnvelopeFields } from "@/components/script-control/script-control-envelope-fields";
import { getPaperInspectorVisuals, seriesInspectorBadgeClass } from "@/lib/paper-inspector-styles";
import {
  emptyDraft,
  initialDraftForEdit,
  maxBookletsForPaper,
  seriesSlotKey,
  type ScriptControlDraft,
} from "@/lib/script-control-editor";
import {
  noScriptsSeriesSummary,
  packingItemPlural,
} from "@/lib/script-packing-terms";
import { validateSeriesDraftForSave } from "@/lib/script-control-series-save";
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

  async function handleSave() {
    onFormError(null);
    const validationError = validateSeriesDraftForSave(draft, recordType, paperNumber, cap);
    if (validationError) {
      onFormError(validationError);
      return;
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
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <ScriptControlEnvelopeFields
            draft={draft}
            paperNumber={paperNumber}
            recordType={recordType}
            cap={cap}
            layout="table"
            autoFocus={isPanel && isEditing}
            onDraftChange={onDraftChange}
          />
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
