import { packingCountDescriptor, packingItemPlural } from "@/lib/script-packing-terms";
import type { MySchoolScriptControlResponse, ScriptSeriesPackingResponse } from "@/lib/api";

export type DraftEnvelope = {
  envelope_number: number;
  booklet_count: number | null;
};

export type ScriptControlDraft = {
  envelopes: DraftEnvelope[];
};

export function emptyDraft(): ScriptControlDraft {
  return { envelopes: [{ envelope_number: 1, booklet_count: null }] };
}

export function draftIsNoScripts(draft: ScriptControlDraft): boolean {
  const env1 = draft.envelopes.find((e) => e.envelope_number === 1);
  return env1 !== undefined && env1.booklet_count === 0;
}

export function initialDraftForEdit(packing: ScriptSeriesPackingResponse | null): ScriptControlDraft {
  if (packing?.no_scripts) {
    return { envelopes: [{ envelope_number: 1, booklet_count: 0 }] };
  }
  if (packing) {
    return draftFromPacking(packing);
  }
  return emptyDraft();
}

export function draftFromPacking(p: ScriptSeriesPackingResponse): ScriptControlDraft {
  return {
    envelopes: [...p.envelopes]
      .sort((a, b) => a.envelope_number - b.envelope_number)
      .map((e) => ({
        envelope_number: e.envelope_number,
        booklet_count: Math.max(0, e.booklet_count),
      })),
  };
}

export function envelopesToPersist(draft: ScriptControlDraft): { envelope_number: number; booklet_count: number }[] {
  const out: { envelope_number: number; booklet_count: number }[] = [];
  for (const e of draft.envelopes) {
    if (e.booklet_count !== null && e.booklet_count > 0) {
      out.push({ envelope_number: e.envelope_number, booklet_count: e.booklet_count });
    }
  }
  return out;
}

export function isConsecutiveFromOne(envelopeNumbers: number[]): boolean {
  const nums = [...envelopeNumbers].sort((a, b) => a - b);
  if (nums.length === 0) return false;
  return nums.every((n, i) => n === i + 1);
}

function missingEnvelopesInConsecutivePrefix(envelopeNumbers: number[]): number[] {
  const nums = [...envelopeNumbers].sort((a, b) => a - b);
  if (nums.length === 0) return [];
  const k = nums.length;
  const present = new Set(nums);
  const missing: number[] = [];
  for (let i = 1; i <= k; i++) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

export function consecutiveEnvelopeNumbersMessage(paperNumber: number, envelopeNumbers: number[]): string {
  const missing = missingEnvelopesInConsecutivePrefix(envelopeNumbers);
  const items = packingItemPlural(paperNumber);
  const base = `You can't record envelopes with empty or zero ${items}.`;
  if (missing.length === 0) {
    return `${base} Each envelope from 1 up to the number you're saving must have a ${packingCountDescriptor(paperNumber)}.`;
  }
  const listed =
    missing.length === 1 ? `envelope ${missing[0]}` : `envelopes ${missing.join(", ")}`;
  return `${base} Missing: ${listed}.`;
}

export function maxBookletsForPaper(d: MySchoolScriptControlResponse, paperNumber: number): number {
  if (paperNumber === 1) return d.scripts_per_envelope_paper_1;
  if (paperNumber === 2) return d.scripts_per_envelope_paper_2;
  return d.scripts_per_envelope;
}

export function scriptCapsSummary(d: MySchoolScriptControlResponse): string {
  const g = d.scripts_per_envelope;
  const p1 = d.scripts_per_envelope_paper_1;
  const p2 = d.scripts_per_envelope_paper_2;
  if (p1 === p2 && p2 === g) {
    return `Paper 1: up to ${g} scannables per envelope. Paper 2 and other papers: up to ${g} booklets per envelope.`;
  }
  if (p1 === p2) {
    return `Paper 1: up to ${p1} scannables per envelope; Paper 2: up to ${p1} booklets per envelope. Other papers: up to ${g} booklets per envelope.`;
  }
  return `Paper 1: up to ${p1} scannables; Paper 2: up to ${p2} booklets; other papers: up to ${g} booklets per envelope.`;
}

export function seriesSlotKey(subjectId: number, paperNumber: number, seriesNumber: number): string {
  return `${subjectId}-${paperNumber}-${seriesNumber}`;
}
