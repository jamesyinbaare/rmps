"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ScriptControlEditSeriesNav,
  pickDefaultSeriesKey,
  seriesNavKey,
  type SeriesNavItem,
} from "@/components/script-control/script-control-edit-series-nav";
import { ScriptControlMobileSeriesEditor } from "@/components/script-control/script-control-mobile-series-editor";
import { ScriptControlMobileSeriesList } from "@/components/script-control/script-control-mobile-series-list";
import { ScriptControlSchoolIdentity } from "@/components/script-control/script-control-school-identity";
import { displaySubjectCode } from "@/lib/script-control-completion";
import { getPaperInspectorVisuals } from "@/lib/paper-inspector-styles";
import {
  ScriptControlSeriesBlock,
  emptyDraft,
  initialDraftForEdit,
  seriesSlotKey,
  type SeriesEditHandlers,
} from "@/components/script-control/script-control-series-form";
import type { MySchoolScriptControlResponse, ScriptSeriesPackingResponse } from "@/lib/api";
import type { ScriptControlDraft } from "@/lib/script-control-editor";

type Props = {
  data: MySchoolScriptControlResponse;
  subjectId: number;
  recordType: "regular" | "irregular";
  editingKey: string | null;
  draft: ScriptControlDraft;
  formError: string | null;
  onOpenEdit: (subjectId: number, paperNumber: number, seriesNumber: number, packing: ScriptSeriesPackingResponse | null) => void;
  onCloseEdit: () => void;
  onDraftChange: (draft: ScriptControlDraft) => void;
  onFormError: (msg: string | null) => void;
  handlers: SeriesEditHandlers;
  paperFilter?: number | null;
  schoolDisplayName?: string | null;
  /** Mobile: highlight row after save (nav key). */
  highlightedSeriesKey?: string | null;
  /** Mobile: open editor for this nav key after save. */
  mobileOpenSeriesKey?: string | null;
  onMobileOpenHandled?: () => void;
  successFlashKey?: string | null;
  canSaveAndNext?: boolean;
  onBeforeSave?: (advanceSeries: boolean) => void;
};

export function ScriptControlSubjectEditor({
  data,
  subjectId,
  recordType,
  editingKey,
  draft,
  formError,
  onOpenEdit,
  onCloseEdit,
  onDraftChange,
  onFormError,
  handlers,
  paperFilter,
  schoolDisplayName,
  highlightedSeriesKey,
  mobileOpenSeriesKey,
  onMobileOpenHandled,
  successFlashKey,
  canSaveAndNext,
  onBeforeSave,
}: Props) {
  const subject = data.subjects.find((s) => s.subject_id === subjectId);
  const [desktopSeriesKey, setDesktopSeriesKey] = useState<string | null>(null);
  const [mobileSeriesKey, setMobileSeriesKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const papers =
    subject && paperFilter != null && Number.isFinite(paperFilter)
      ? subject.papers.filter((p) => p.paper_number === paperFilter)
      : (subject?.papers ?? []);

  const navItems = useMemo<SeriesNavItem[]>(
    () => papers.flatMap((paper) => paper.series.map((slot) => ({ paperNumber: paper.paper_number, slot }))),
    [papers],
  );

  useEffect(() => {
    if (navItems.length === 0) {
      setDesktopSeriesKey(null);
      setMobileSeriesKey(null);
      return;
    }
    const defaultKey = pickDefaultSeriesKey(navItems);
    setDesktopSeriesKey((cur) => {
      if (cur && navItems.some((it) => seriesNavKey(it.paperNumber, it.slot.series_number) === cur)) return cur;
      return defaultKey;
    });
    setMobileSeriesKey((cur) => {
      if (cur && navItems.some((it) => seriesNavKey(it.paperNumber, it.slot.series_number) === cur)) return cur;
      return defaultKey;
    });
  }, [navItems]);

  useEffect(() => {
    if (!desktopSeriesKey || navItems.length === 0) return;
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) return;
    const item = navItems.find(
      (it) => seriesNavKey(it.paperNumber, it.slot.series_number) === desktopSeriesKey,
    );
    if (!item) return;
    onOpenEdit(subjectId, item.paperNumber, item.slot.series_number, item.slot.packing);
    // Open edit when the selected series changes, not when edit is closed after save.
  }, [desktopSeriesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mobileOpenSeriesKey || navItems.length === 0) return;
    const item = navItems.find(
      (it) => seriesNavKey(it.paperNumber, it.slot.series_number) === mobileOpenSeriesKey,
    );
    if (!item) {
      onMobileOpenHandled?.();
      return;
    }
    setMobileSeriesKey(mobileOpenSeriesKey);
    setDesktopSeriesKey(mobileOpenSeriesKey);
    onOpenEdit(subjectId, item.paperNumber, item.slot.series_number, item.slot.packing);
    onMobileOpenHandled?.();
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-series-key="${mobileOpenSeriesKey}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [mobileOpenSeriesKey, navItems, onMobileOpenHandled, onOpenEdit, subjectId]);

  useEffect(() => {
    if (!highlightedSeriesKey) return;
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-series-key="${highlightedSeriesKey}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [highlightedSeriesKey, navItems]);

  if (!subject) {
    return (
      <p className="text-sm text-muted-foreground">
        This school has no registered candidates for the selected subject.
      </p>
    );
  }

  if (papers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No paper {paperFilter} timetable entry for this subject at this school.
      </p>
    );
  }

  const selectedItem = navItems.find(
    (it) => seriesNavKey(it.paperNumber, it.slot.series_number) === desktopSeriesKey,
  );

  const mobileEditingItem = editingKey
    ? navItems.find((it) => seriesSlotKey(subjectId, it.paperNumber, it.slot.series_number) === editingKey)
    : null;

  function selectSeries(paperNumber: number, seriesNumber: number) {
    const key = seriesNavKey(paperNumber, seriesNumber);
    setDesktopSeriesKey(key);
    setMobileSeriesKey(key);
    const item = navItems.find(
      (it) => it.paperNumber === paperNumber && it.slot.series_number === seriesNumber,
    );
    if (item) {
      onOpenEdit(subjectId, paperNumber, seriesNumber, item.slot.packing);
    }
  }

  function selectMobileSeries(paperNumber: number, seriesNumber: number) {
    selectSeries(paperNumber, seriesNumber);
  }

  const mobilePaperNumber = paperFilter ?? navItems[0]?.paperNumber ?? 1;
  const mobilePaperVisuals = getPaperInspectorVisuals(mobilePaperNumber);

  return (
    <div className="space-y-4">
      {/* Mobile: series list + full-screen editor */}
      <div className="space-y-4 lg:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {displaySubjectCode(subject)} — {subject.subject_name}
            </h3>
            <span className={mobilePaperVisuals.badgeClass}>Paper {mobilePaperNumber}</span>
          </div>
          <ScriptControlSchoolIdentity
            schoolCode={data.school_code}
            schoolName={schoolDisplayName}
            centreCode={data.examination_centre_code}
            centreName={data.examination_centre_name}
            postedInspectors={data.posted_inspectors ?? []}
            nameClamp={1}
            className="mt-1"
          />
        </div>
        <div ref={listRef}>
          <ScriptControlMobileSeriesList
            items={navItems}
            paperNumber={mobilePaperNumber}
            selectedKey={mobileSeriesKey}
            highlightedKey={highlightedSeriesKey}
            successFlashKey={successFlashKey}
            onSelect={selectMobileSeries}
          />
        </div>
        {mobileEditingItem ? (
          <ScriptControlMobileSeriesEditor
            open={editingKey === seriesSlotKey(subjectId, mobileEditingItem.paperNumber, mobileEditingItem.slot.series_number)}
            data={data}
            subjectId={subjectId}
            paperNumber={mobileEditingItem.paperNumber}
            slot={mobileEditingItem.slot}
            recordType={recordType}
            draft={draft}
            formError={formError}
            canSaveAndNext={canSaveAndNext}
            onBeforeSave={onBeforeSave}
            onDraftChange={onDraftChange}
            onFormError={onFormError}
            onCloseEdit={onCloseEdit}
            handlers={handlers}
          />
        ) : null}
      </div>

      {/* Desktop: series nav + focused panel */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(200px,240px)_1fr] lg:gap-5">
        <ScriptControlEditSeriesNav
          items={navItems}
          selectedKey={desktopSeriesKey}
          onSelect={selectSeries}
        />
        <div className="min-w-0 rounded-xl border border-border bg-muted/15 p-5">
          {selectedItem ? (
            <ScriptControlSeriesBlock
              data={data}
              subjectId={subjectId}
              paperNumber={selectedItem.paperNumber}
              slot={selectedItem.slot}
              recordType={recordType}
              editingKey={editingKey}
              draft={draft}
              formError={formError}
              onOpenEdit={onOpenEdit}
              onCloseEdit={onCloseEdit}
              onDraftChange={onDraftChange}
              onFormError={onFormError}
              handlers={handlers}
              layout="panel"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a series from the list.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export { emptyDraft, initialDraftForEdit, seriesSlotKey };
