/** Deterministic per-paper visual cues for depot script cards (light + dark). Not a substitute for "Paper N" text. */

const PAPER_CARD_CLASSES = [
  "border-l-4 border-l-sky-500/90 bg-sky-50/35 dark:border-l-sky-400/80 dark:bg-sky-950/25",
  "border-l-4 border-l-violet-500/90 bg-violet-50/35 dark:border-l-violet-400/80 dark:bg-violet-950/25",
  "border-l-4 border-l-teal-600/90 bg-teal-50/35 dark:border-l-teal-400/80 dark:bg-teal-950/25",
  "border-l-4 border-l-amber-600/90 bg-amber-50/40 dark:border-l-amber-400/80 dark:bg-amber-950/25",
  "border-l-4 border-l-rose-500/90 bg-rose-50/35 dark:border-l-rose-400/80 dark:bg-rose-950/25",
  "border-l-4 border-l-cyan-600/90 bg-cyan-50/35 dark:border-l-cyan-400/80 dark:bg-cyan-950/25",
] as const;

const PAPER_BADGE_CLASSES = [
  "border-sky-400/70 bg-sky-100/80 text-sky-950 dark:border-sky-500/50 dark:bg-sky-950/50 dark:text-sky-100",
  "border-violet-400/70 bg-violet-100/80 text-violet-950 dark:border-violet-500/50 dark:bg-violet-950/50 dark:text-violet-100",
  "border-teal-500/60 bg-teal-100/80 text-teal-950 dark:border-teal-500/50 dark:bg-teal-950/50 dark:text-teal-100",
  "border-amber-500/60 bg-amber-100/80 text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-100",
  "border-rose-400/70 bg-rose-100/80 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/50 dark:text-rose-100",
  "border-cyan-500/60 bg-cyan-100/80 text-cyan-950 dark:border-cyan-500/50 dark:bg-cyan-950/50 dark:text-cyan-100",
] as const;

function paperPaletteIndex(paperNumber: number): number {
  const n = Number.isFinite(paperNumber) && paperNumber >= 1 ? Math.floor(paperNumber) : 1;
  return (n - 1) % PAPER_CARD_CLASSES.length;
}

export function depotPaperCardAccentClass(paperNumber: number): string {
  return PAPER_CARD_CLASSES[paperPaletteIndex(paperNumber)] ?? PAPER_CARD_CLASSES[0];
}

export function depotPaperBadgeClass(paperNumber: number): string {
  return PAPER_BADGE_CLASSES[paperPaletteIndex(paperNumber)] ?? PAPER_BADGE_CLASSES[0];
}
