"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ScriptControlEditSeriesNav,
  pickDefaultSeriesKey,
  seriesNavKey,
  type SeriesNavItem,
} from "@/components/script-control/script-control-edit-series-nav";
import { displaySubjectCode } from "@/lib/script-control-completion";
import { getPaperInspectorVisuals, isPaperBundleFullyRecorded } from "@/lib/paper-inspector-styles";
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
}: Props) {
  const subject = data.subjects.find((s) => s.subject_id === subjectId);
  const [desktopSeriesKey, setDesktopSeriesKey] = useState<string | null>(null);

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
      return;
    }
    setDesktopSeriesKey((cur) => {
      if (cur && navItems.some((it) => seriesNavKey(it.paperNumber, it.slot.series_number) === cur)) return cur;
      return pickDefaultSeriesKey(navItems);
    });
  }, [navItems]);

  useEffect(() => {
    if (!desktopSeriesKey || navItems.length === 0) return;
    const item = navItems.find(
      (it) => seriesNavKey(it.paperNumber, it.slot.series_number) === desktopSeriesKey,
    );
    if (!item) return;
    onOpenEdit(subjectId, item.paperNumber, item.slot.series_number, item.slot.packing);
    // Open edit when the selected series changes, not when edit is closed after save.
  }, [desktopSeriesKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function selectSeries(paperNumber: number, seriesNumber: number) {
    setDesktopSeriesKey(seriesNavKey(paperNumber, seriesNumber));
    const item = navItems.find(
      (it) => it.paperNumber === paperNumber && it.slot.series_number === seriesNumber,
    );
    if (item) {
      onOpenEdit(subjectId, paperNumber, seriesNumber, item.slot.packing);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mobile: stacked series list */}
      <div className="lg:hidden space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {displaySubjectCode(subject)} — {subject.subject_name}
          </h3>
          <p className="text-sm text-muted-foreground">{data.school_code}</p>
        </div>
        {papers.map((paper) => {
          const v = getPaperInspectorVisuals(paper.paper_number);
          const bundle = {
            subjectId: subject.subject_id,
            subjectCode: subject.subject_code,
            subjectOriginalCode: subject.subject_original_code ?? null,
            subjectName: subject.subject_name,
            paperNumber: paper.paper_number,
            examinationDate: paper.examination_date,
            series: paper.series,
          };
          const recorded = isPaperBundleFullyRecorded(bundle);
          return (
            <div key={paper.paper_number} className={v.cardClass}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={v.badgeClass}>{v.badgeShortLabel}</span>
                <span className="font-bold">Paper {paper.paper_number}</span>
                {recorded ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Recorded</span>
                ) : null}
              </div>
              <ul className="space-y-4">
                {paper.series.map((slot) => (
                  <ScriptControlSeriesBlock
                    key={slot.series_number}
                    data={data}
                    subjectId={subjectId}
                    paperNumber={paper.paper_number}
                    slot={slot}
                    recordType={recordType}
                    editingKey={editingKey}
                    draft={draft}
                    formError={formError}
                    onOpenEdit={onOpenEdit}
                    onCloseEdit={onCloseEdit}
                    onDraftChange={onDraftChange}
                    onFormError={onFormError}
                    handlers={handlers}
                  />
                ))}
              </ul>
            </div>
          );
        })}
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
