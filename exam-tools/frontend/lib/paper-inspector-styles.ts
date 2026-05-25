import type {
  QuestionPaperSeriesSlotResponse,
  QuestionPaperSubjectRowResponse,
  ScriptSeriesSlotResponse,
  ScriptSubjectRowResponse,
} from "@/lib/api";

/**
 * Shared visual language for inspector script-control paper blocks (Paper 1 vs 2, etc.).
 * Uses theme tokens so light/dark modes stay coherent.
 */
export type ScriptPaperBundle = {
  subjectId: number;
  subjectCode: string;
  subjectOriginalCode: string | null;
  subjectName: string;
  paperNumber: number;
  examinationDate: string | null;
  series: ScriptSeriesSlotResponse[];
};

export type SubjectScriptBundleGroup = {
  key: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  bundles: ScriptPaperBundle[];
};

export type DueAndUpcomingPapers = {
  due: ScriptPaperBundle[];
  upcoming: ScriptPaperBundle[];
};

export function displayScriptSubjectCode(bundle: ScriptPaperBundle): string {
  return (bundle.subjectOriginalCode && bundle.subjectOriginalCode.trim() !== ""
    ? bundle.subjectOriginalCode
    : bundle.subjectCode
  ).trim();
}

export function flattenScriptSubjectsToBundles(subjects: ScriptSubjectRowResponse[]): ScriptPaperBundle[] {
  const out: ScriptPaperBundle[] = [];
  for (const sub of subjects) {
    for (const paper of sub.papers) {
      out.push({
        subjectId: sub.subject_id,
        subjectCode: sub.subject_code,
        subjectOriginalCode: sub.subject_original_code ?? null,
        subjectName: sub.subject_name,
        paperNumber: paper.paper_number,
        examinationDate: paper.examination_date ?? null,
        series: paper.series,
      });
    }
  }
  return out;
}

/** Earliest scheduled date first; papers without a date last. */
export function sortPaperBundlesByScheduleAscending(bundles: ScriptPaperBundle[]): ScriptPaperBundle[] {
  return [...bundles].sort((a, b) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) {
      return a.paperNumber - b.paperNumber;
    }
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = ad.localeCompare(bd);
    return c !== 0 ? c : a.paperNumber - b.paperNumber;
  });
}

/** Newest scheduled date first; papers without a date last. */
export function sortPaperBundlesBySchedule(bundles: ScriptPaperBundle[]): ScriptPaperBundle[] {
  return [...bundles].sort((a, b) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) {
      return b.paperNumber - a.paperNumber;
    }
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = bd.localeCompare(ad);
    return c !== 0 ? c : b.paperNumber - a.paperNumber;
  });
}

/** Paper 1 before Paper 2 within a subject, regardless of schedule date. */
export function sortPaperBundlesByPaperNumber(bundles: ScriptPaperBundle[]): ScriptPaperBundle[] {
  return [...bundles].sort((a, b) => a.paperNumber - b.paperNumber);
}

export function groupPaperBundlesBySubject(bundles: ScriptPaperBundle[]): SubjectScriptBundleGroup[] {
  const map = new Map<string, SubjectScriptBundleGroup>();
  for (const b of bundles) {
    const key = String(b.subjectId);
    const existing = map.get(key);
    if (existing) {
      existing.bundles.push(b);
      continue;
    }
    map.set(key, {
      key,
      subjectId: b.subjectId,
      subjectCode: displayScriptSubjectCode(b),
      subjectName: b.subjectName,
      bundles: [b],
    });
  }
  for (const g of map.values()) {
    g.bundles = sortPaperBundlesByPaperNumber(g.bundles);
  }
  return Array.from(map.values());
}

/** Subjects with the earliest scheduled paper first; subjects with no dates last. */
export function sortSubjectBundleGroupsAscending(groups: SubjectScriptBundleGroup[]): SubjectScriptBundleGroup[] {
  return [...groups].sort((a, b) => {
    const earliestDate = (bundles: ScriptPaperBundle[]) => {
      let earliest: string | null = null;
      for (const x of bundles) {
        const d = x.examinationDate;
        if (d == null) continue;
        if (earliest == null || d < earliest) earliest = d;
      }
      return earliest;
    };
    const ad = earliestDate(a.bundles);
    const bd = earliestDate(b.bundles);
    if (ad == null && bd == null) return a.subjectCode.localeCompare(b.subjectCode);
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = ad.localeCompare(bd);
    return c !== 0 ? c : a.subjectCode.localeCompare(b.subjectCode);
  });
}

/** Subjects with the latest scheduled paper first; subjects with no dates last. */
export function sortSubjectBundleGroups(groups: SubjectScriptBundleGroup[]): SubjectScriptBundleGroup[] {
  return [...groups].sort((a, b) => {
    const latestDate = (bundles: ScriptPaperBundle[]) => {
      let latest: string | null = null;
      for (const x of bundles) {
        const d = x.examinationDate;
        if (d == null) continue;
        if (latest == null || d > latest) latest = d;
      }
      return latest;
    };
    const ad = latestDate(a.bundles);
    const bd = latestDate(b.bundles);
    if (ad == null && bd == null) return b.subjectCode.localeCompare(a.subjectCode);
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = bd.localeCompare(ad);
    return c !== 0 ? c : b.subjectCode.localeCompare(a.subjectCode);
  });
}

export function subjectScriptAccordionId(scope: "due" | "upcoming", subjectKey: string): string {
  return `${scope}:${subjectKey}`;
}

export function partitionDueAndUpcoming(
  subjects: ScriptSubjectRowResponse[],
  today: string,
): DueAndUpcomingPapers {
  const all = flattenScriptSubjectsToBundles(subjects);
  const due: ScriptPaperBundle[] = [];
  const upcoming: ScriptPaperBundle[] = [];
  for (const b of all) {
    const ed = b.examinationDate;
    if (ed && ed > today) {
      upcoming.push(b);
    } else {
      due.push(b);
    }
  }
  return {
    due: sortPaperBundlesBySchedule(due),
    upcoming: sortPaperBundlesByScheduleAscending(upcoming),
  };
}

export function isPaperBundleFullyRecorded(bundle: ScriptPaperBundle): boolean {
  return bundle.series.length > 0 && bundle.series.every((s) => s.packing != null);
}

export function dueListHint(due: ScriptPaperBundle[], upcoming: ScriptPaperBundle[]): string | null {
  const allDueRecorded =
    due.length > 0 && due.every((b) => isPaperBundleFullyRecorded(b));
  if (due.length > 0 && !allDueRecorded) return null;
  if (allDueRecorded && upcoming.length > 0) {
    return "All papers due so far are recorded. Upcoming papers are listed below.";
  }
  if (allDueRecorded) {
    return "All papers due so far are recorded. Expand a subject to review or edit.";
  }
  if (due.length === 0 && upcoming.length > 0) {
    return "No papers to pack yet — every scheduled paper is still in the future.";
  }
  return null;
}

export function irregularDueListHint(due: ScriptPaperBundle[], upcoming: ScriptPaperBundle[]): string | null {
  const allDueRecorded =
    due.length > 0 && due.every((b) => isPaperBundleFullyRecorded(b));
  if (due.length > 0 && !allDueRecorded) return null;
  if (allDueRecorded && upcoming.length > 0) {
    return "No pending irregular entries on due papers. Upcoming papers are listed below.";
  }
  if (allDueRecorded) {
    return "No pending irregular entries on due papers. Expand a subject to review or edit.";
  }
  if (due.length === 0 && upcoming.length > 0) {
    return "No irregular entries recorded yet. Use this page only when irregular scripts occur.";
  }
  return null;
}

export type PaperInspectorVisuals = {
  cardClass: string;
  badgeClass: string;
  badgeShortLabel: string;
  seriesRowClass: string;
  /** Top border when the envelope editor is expanded */
  editDividerClass: string;
};

/** Distinct from paper P1/P2 badges — warm secondary (gold) tint so series stands out. */
export const seriesInspectorBadgeClass =
  "inline-flex shrink-0 items-center rounded-md border border-secondary/50 bg-secondary/25 px-2.5 py-1 text-xs font-semibold tabular-nums text-secondary-foreground shadow-sm";

/**
 * Merge consecutive upcoming rows that share the same subject and scheduled date
 * (e.g. Paper 1 and Paper 2 on the same day → one list row).
 */
export function groupUpcomingBundlesBySubjectAndDate<
  T extends { subjectId: number; examinationDate: string | null; paperNumber: number },
>(upcoming: T[]): T[][] {
  const groups: T[][] = [];
  for (const b of upcoming) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.length > 0 &&
      last[0].subjectId === b.subjectId &&
      (last[0].examinationDate ?? "") === (b.examinationDate ?? "")
    ) {
      last.push(b);
    } else {
      groups.push([b]);
    }
  }
  for (const g of groups) {
    g.sort((a, c) => a.paperNumber - c.paperNumber);
  }
  return groups;
}

export function formatUpcomingPapersLabel<T extends { paperNumber: number }>(bundles: T[]): string {
  const nums = bundles.map((b) => b.paperNumber);
  return bundles.length === 1 ? `Paper ${nums[0]}` : `Papers ${nums.join(" & ")}`;
}

/** Question paper control — same bundle shape as script control for sorting/grouping. */
export type QuestionPaperBundle = {
  subjectId: number;
  subjectCode: string;
  subjectOriginalCode: string | null;
  subjectName: string;
  /** Canonical paper number for saves. */
  paperNumber: number;
  /** Timetable papers shown in the UI (e.g. [1, 2] when written together). */
  coversPapers: number[];
  examinationDate: string | null;
  series: QuestionPaperSeriesSlotResponse[];
};

export function questionPaperBundleLabel(bundle: QuestionPaperBundle): string {
  const papers = bundle.coversPapers.length > 0 ? bundle.coversPapers : [bundle.paperNumber];
  return formatUpcomingPapersLabel(
    papers.map((paperNumber) => ({ paperNumber })),
  );
}

export type SubjectQuestionPaperBundleGroup = {
  key: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  bundles: QuestionPaperBundle[];
};

export type QuestionPaperDueAndUpcoming = {
  due: QuestionPaperBundle[];
  upcoming: QuestionPaperBundle[];
};

export function displayQuestionPaperSubjectCode(bundle: QuestionPaperBundle): string {
  return (bundle.subjectOriginalCode && bundle.subjectOriginalCode.trim() !== ""
    ? bundle.subjectOriginalCode
    : bundle.subjectCode
  ).trim();
}

export function flattenQuestionPaperSubjectsToBundles(
  subjects: QuestionPaperSubjectRowResponse[],
): QuestionPaperBundle[] {
  const out: QuestionPaperBundle[] = [];
  for (const sub of subjects) {
    for (const paper of sub.papers) {
      const covers =
        paper.covers_papers && paper.covers_papers.length > 0
          ? [...paper.covers_papers].sort((a, b) => a - b)
          : [paper.paper_number];
      out.push({
        subjectId: sub.subject_id,
        subjectCode: sub.subject_code,
        subjectOriginalCode: sub.subject_original_code ?? null,
        subjectName: sub.subject_name,
        paperNumber: paper.paper_number,
        coversPapers: covers,
        examinationDate: paper.examination_date ?? null,
        series: paper.series,
      });
    }
  }
  return out;
}

function sortQuestionPaperBundlesByScheduleAscending(bundles: QuestionPaperBundle[]): QuestionPaperBundle[] {
  return [...bundles].sort((a, b) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) return a.paperNumber - b.paperNumber;
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = ad.localeCompare(bd);
    return c !== 0 ? c : a.paperNumber - b.paperNumber;
  });
}

function sortQuestionPaperBundlesBySchedule(bundles: QuestionPaperBundle[]): QuestionPaperBundle[] {
  return [...bundles].sort((a, b) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) return b.paperNumber - a.paperNumber;
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = bd.localeCompare(ad);
    return c !== 0 ? c : b.paperNumber - a.paperNumber;
  });
}

export function groupQuestionPaperBundlesBySubject(
  bundles: QuestionPaperBundle[],
): SubjectQuestionPaperBundleGroup[] {
  const map = new Map<string, SubjectQuestionPaperBundleGroup>();
  for (const b of bundles) {
    const key = String(b.subjectId);
    const existing = map.get(key);
    if (existing) {
      existing.bundles.push(b);
      continue;
    }
    map.set(key, {
      key,
      subjectId: b.subjectId,
      subjectCode: displayQuestionPaperSubjectCode(b),
      subjectName: b.subjectName,
      bundles: [b],
    });
  }
  for (const g of map.values()) {
    g.bundles = [...g.bundles].sort((a, b) => a.paperNumber - b.paperNumber);
  }
  return Array.from(map.values());
}

export function sortQuestionPaperSubjectBundleGroups(
  groups: SubjectQuestionPaperBundleGroup[],
): SubjectQuestionPaperBundleGroup[] {
  return [...groups].sort((a, b) => {
    const latestDate = (bundles: QuestionPaperBundle[]) => {
      let latest: string | null = null;
      for (const x of bundles) {
        const d = x.examinationDate;
        if (d == null) continue;
        if (latest == null || d > latest) latest = d;
      }
      return latest;
    };
    const ad = latestDate(a.bundles);
    const bd = latestDate(b.bundles);
    if (ad == null && bd == null) return b.subjectCode.localeCompare(a.subjectCode);
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = bd.localeCompare(ad);
    return c !== 0 ? c : b.subjectCode.localeCompare(a.subjectCode);
  });
}

export function sortQuestionPaperSubjectBundleGroupsAscending(
  groups: SubjectQuestionPaperBundleGroup[],
): SubjectQuestionPaperBundleGroup[] {
  return [...groups].sort((a, b) => {
    const earliestDate = (bundles: QuestionPaperBundle[]) => {
      let earliest: string | null = null;
      for (const x of bundles) {
        const d = x.examinationDate;
        if (d == null) continue;
        if (earliest == null || d < earliest) earliest = d;
      }
      return earliest;
    };
    const ad = earliestDate(a.bundles);
    const bd = earliestDate(b.bundles);
    if (ad == null && bd == null) return a.subjectCode.localeCompare(b.subjectCode);
    if (ad == null) return 1;
    if (bd == null) return -1;
    const c = ad.localeCompare(bd);
    return c !== 0 ? c : a.subjectCode.localeCompare(b.subjectCode);
  });
}

export function questionPaperAccordionId(scope: "due" | "upcoming", subjectKey: string): string {
  return `${scope}:${subjectKey}`;
}

export function partitionQuestionPaperDueAndUpcoming(
  subjects: QuestionPaperSubjectRowResponse[],
  today: string,
): QuestionPaperDueAndUpcoming {
  const all = flattenQuestionPaperSubjectsToBundles(subjects);
  const due: QuestionPaperBundle[] = [];
  const upcoming: QuestionPaperBundle[] = [];
  for (const b of all) {
    const ed = b.examinationDate;
    if (ed && ed > today) {
      upcoming.push(b);
    } else {
      due.push(b);
    }
  }
  return {
    due: sortQuestionPaperBundlesBySchedule(due),
    upcoming: sortQuestionPaperBundlesByScheduleAscending(upcoming),
  };
}

export function isQuestionPaperSeriesRecorded(ser: QuestionPaperSeriesSlotResponse): boolean {
  return (
    ser.copies_received > 0 ||
    ser.copies_used > 0 ||
    ser.copies_to_library > 0 ||
    ser.copies_remaining > 0
  );
}

export function isQuestionPaperBundleFullyRecorded(bundle: QuestionPaperBundle): boolean {
  return bundle.series.length > 0 && bundle.series.every((s) => isQuestionPaperSeriesRecorded(s));
}

export function questionPaperDueListHint(
  due: QuestionPaperBundle[],
  upcoming: QuestionPaperBundle[],
): string | null {
  const allDueRecorded = due.length > 0 && due.every((b) => isQuestionPaperBundleFullyRecorded(b));
  if (due.length > 0 && !allDueRecorded) return null;
  if (allDueRecorded && upcoming.length > 0) {
    return "All papers due so far are recorded. Upcoming papers are listed below.";
  }
  if (allDueRecorded) {
    return "All papers due so far are recorded. Expand a subject to review or edit.";
  }
  if (due.length === 0 && upcoming.length > 0) {
    return "No question paper counts to record yet — every scheduled paper is still in the future.";
  }
  return null;
}

export function getPaperInspectorVisuals(paperNumber: number): PaperInspectorVisuals {
  if (paperNumber === 1) {
    return {
      cardClass:
        "rounded-2xl border border-border border-l-4 border-l-accent bg-gradient-to-r from-accent/[0.07] via-card to-card p-4 sm:p-5 shadow-sm",
      badgeClass:
        "inline-flex shrink-0 items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent",
      badgeShortLabel: "P1",
      seriesRowClass:
        "flex flex-col gap-2 rounded-lg border border-border/80 border-l-2 border-l-accent/55 bg-background/50 p-3 pl-3",
      editDividerClass: "border-t-2 border-t-accent/25",
    };
  }
  if (paperNumber === 2) {
    return {
      cardClass:
        "rounded-2xl border border-border border-l-4 border-l-success bg-gradient-to-r from-success/[0.07] via-card to-card p-4 sm:p-5 shadow-sm",
      badgeClass:
        "inline-flex shrink-0 items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-success",
      badgeShortLabel: "P2",
      seriesRowClass:
        "flex flex-col gap-2 rounded-lg border border-border/80 border-l-2 border-l-success/55 bg-background/50 p-3 pl-3",
      editDividerClass: "border-t-2 border-t-success/25",
    };
  }
  return {
    cardClass: "rounded-2xl border border-border border-l-4 border-l-muted-foreground/35 bg-card p-4 sm:p-5 shadow-sm",
    badgeClass:
      "inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground",
    badgeShortLabel: `P${paperNumber}`,
    seriesRowClass:
      "flex flex-col gap-2 rounded-lg border border-border/80 border-l-2 border-l-muted-foreground/35 bg-background/50 p-3 pl-3",
    editDividerClass: "border-t border-border",
  };
}
