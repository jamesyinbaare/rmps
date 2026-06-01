import {
  consecutiveEnvelopeNumbersMessage,
  draftIsNoScripts,
  envelopesToPersist,
  isConsecutiveFromOne,
  type ScriptControlDraft,
} from "@/lib/script-control-editor";
import { packingItemPlural } from "@/lib/script-packing-terms";

export function validateSeriesDraftForSave(
  draft: ScriptControlDraft,
  recordType: "regular" | "irregular",
  paperNumber: number,
  cap: number,
): string | null {
  if (recordType === "regular" && draftIsNoScripts(draft)) return null;

  const persisted = envelopesToPersist(draft);
  if (persisted.length === 0) {
    return "Enter a count for envelope 1, or enter 0 if there is nothing to pack.";
  }
  if (!isConsecutiveFromOne(persisted.map((e) => e.envelope_number))) {
    return consecutiveEnvelopeNumbersMessage(paperNumber, persisted.map((e) => e.envelope_number));
  }
  for (const env of persisted) {
    if (env.booklet_count > cap) {
      return `Envelope ${env.envelope_number}: at most ${cap} ${packingItemPlural(paperNumber)}.`;
    }
  }
  return null;
}
