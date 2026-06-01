"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { DiscardChangesConfirmModal } from "@/components/discard-changes-confirm-modal";
import { ScriptControlEnvelopeFields } from "@/components/script-control/script-control-envelope-fields";
import type { SeriesEditHandlers } from "@/components/script-control/script-control-series-form";
import {
  draftFromPacking,
  initialDraftForEdit,
  maxBookletsForPaper,
  type ScriptControlDraft,
} from "@/lib/script-control-editor";
import { validateSeriesDraftForSave } from "@/lib/script-control-series-save";
import { getPaperInspectorVisuals } from "@/lib/paper-inspector-styles";
import type { MySchoolScriptControlResponse, ScriptSeriesSlotResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const btnPrimary =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50";

function draftsEqual(a: ScriptControlDraft, b: ScriptControlDraft): boolean {
  if (a.envelopes.length !== b.envelopes.length) return false;
  return a.envelopes.every(
    (e, i) =>
      e.envelope_number === b.envelopes[i]?.envelope_number &&
      e.booklet_count === b.envelopes[i]?.booklet_count,
  );
}

type Props = {
  open: boolean;
  data: MySchoolScriptControlResponse;
  subjectId: number;
  paperNumber: number;
  slot: ScriptSeriesSlotResponse;
  recordType: "regular" | "irregular";
  draft: ScriptControlDraft;
  formError: string | null;
  canSaveAndNext?: boolean;
  onBeforeSave?: (advanceSeries: boolean) => void;
  onDraftChange: (draft: ScriptControlDraft) => void;
  onFormError: (msg: string | null) => void;
  onCloseEdit: () => void;
  handlers: SeriesEditHandlers;
};

export function ScriptControlMobileSeriesEditor({
  open,
  data,
  subjectId,
  paperNumber,
  slot,
  recordType,
  draft,
  formError,
  canSaveAndNext = false,
  onBeforeSave,
  onDraftChange,
  onFormError,
  onCloseEdit,
  handlers,
}: Props) {
  const packing = slot.packing;
  const cap = maxBookletsForPaper(data, paperNumber);
  const paperVisuals = getPaperInspectorVisuals(paperNumber);
  const anyVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
  const [pendingClose, setPendingClose] = useState(false);

  const isDirty = useMemo(() => {
    if (packing) return !draftsEqual(draft, draftFromPacking(packing));
    return !draftsEqual(draft, initialDraftForEdit(null));
  }, [draft, packing]);

  function requestClose() {
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    onCloseEdit();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) return;
    requestClose();
  }

  async function handleSave(advanceSeries: boolean) {
    onFormError(null);
    const validationError = validateSeriesDraftForSave(draft, recordType, paperNumber, cap);
    if (validationError) {
      onFormError(validationError);
      return;
    }
    onBeforeSave?.(advanceSeries);
    await handlers.onSave(subjectId, paperNumber, slot.series_number, draft, {
      hadVerified: anyVerified,
      hadEnvelopes: Boolean(packing?.envelopes?.length),
    });
  }

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={handleOpenChange}
        title={`Series ${slot.series_number}, paper ${paperNumber}`}
        disableAutoFocus
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <button type="button" className={btnSecondary} disabled={handlers.busy} onClick={requestClose}>
              Close
            </button>
            {canSaveAndNext ? (
              <button
                type="button"
                className={btnPrimary}
                disabled={handlers.busy}
                onClick={() => void handleSave(true)}
              >
                {handlers.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save &amp; next
              </button>
            ) : (
              <button
                type="button"
                className={btnPrimary}
                disabled={handlers.busy}
                onClick={() => void handleSave(false)}
              >
                {handlers.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save
              </button>
            )}
          </div>
        }
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Series {slot.series_number}</h2>
              <span className={paperVisuals.badgeClass}>Paper {paperNumber}</span>
            </div>
          </div>
          {packing ? (
            <button
              type="button"
              className={cn(btnDanger, "min-h-9 shrink-0 px-2 text-xs")}
              disabled={handlers.busy}
              onClick={() => void handlers.onClear(subjectId, paperNumber, slot.series_number, packing)}
            >
              Clear
            </button>
          ) : null}
        </div>

        {anyVerified ? (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Verified — saving clears depot verification.
          </p>
        ) : null}
        {formError ? <p className="mb-3 text-sm text-destructive">{formError}</p> : null}
        <ScriptControlEnvelopeFields
          draft={draft}
          paperNumber={paperNumber}
          recordType={recordType}
          cap={cap}
          layout="cards"
          autoFocus
          autoFocusDelay={120}
          onDraftChange={onDraftChange}
        />
      </BottomSheet>

      {pendingClose ? (
        <DiscardChangesConfirmModal
          onCancel={() => setPendingClose(false)}
          onConfirm={() => {
            setPendingClose(false);
            onCloseEdit();
          }}
        />
      ) : null}
    </>
  );
}
