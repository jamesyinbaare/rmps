/**
 * Shared visual language for inspector script-control paper blocks (Paper 1 vs 2, etc.).
 * Uses theme tokens so light/dark modes stay coherent.
 */
export type PaperInspectorVisuals = {
  cardClass: string;
  badgeClass: string;
  badgeShortLabel: string;
  seriesRowClass: string;
  /** Top border when the envelope editor is expanded */
  editDividerClass: string;
};

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
