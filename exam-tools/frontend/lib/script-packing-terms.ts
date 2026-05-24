/** User-facing nouns for script packing: Paper 1 uses scannables; other papers use booklets. */

export function packingItemPlural(paperNumber: number): string {
  return paperNumber === 1 ? "scannables" : "booklets";
}

export function packingItemSingular(paperNumber: number): string {
  return paperNumber === 1 ? "scannable" : "booklet";
}

export function packingCountDescriptor(paperNumber: number): string {
  return paperNumber === 1 ? "scannable count" : "booklet count";
}

export function packingCountFieldLabel(paperNumber: number): string {
  return paperNumber === 1 ? "Scannables" : "Booklets";
}

export function irregularPackingItemPlural(paperNumber: number): string {
  return paperNumber === 1 ? "irregular scannables" : "irregular booklets";
}

export function irregularPackingItemSingular(paperNumber: number): string {
  return paperNumber === 1 ? "irregular scannable" : "irregular booklet";
}

export function packingItemNounForCount(count: number, paperNumber: number): string {
  return count === 1 ? packingItemSingular(paperNumber) : packingItemPlural(paperNumber);
}

export function irregularPackingNounForCount(count: number, paperNumber: number): string {
  return count === 1 ? irregularPackingItemSingular(paperNumber) : irregularPackingItemPlural(paperNumber);
}

export function packingCountTypePhrase(paperNumber: number): string {
  return paperNumber === 1 ? "Scannable" : "Booklet";
}

/** Inspector summary when a worked-scripts series has nothing to pack. */
export function noScriptsSeriesSummary(paperNumber: number): string {
  return paperNumber === 1
    ? "No scannables to pack for this series"
    : "No booklets to pack for this series";
}

/** Helper while editing when envelope 1 count is zero. */
export function noScriptsSeriesEditHint(paperNumber: number): string {
  return paperNumber === 1
    ? "There are no scannables for this series. Tap Save when you're done."
    : "There are no booklets for this series. Tap Save when you're done.";
}

/** Hint above the envelope form (how to record a nil return). */
export function noScriptsEnvelope1Hint(paperNumber: number): string {
  return paperNumber === 1
    ? "If this series has no scannables, enter 0 on envelope 1."
    : "If this series has no booklets, enter 0 on envelope 1.";
}
