import type { SubjectMarkingBreakdownRow } from "@/lib/api";

export type MarkingScriptSource = "allocation" | "manual";

export function scriptSourceLabel(source: MarkingScriptSource | "mixed"): string {
  if (source === "manual") return "Manual";
  if (source === "mixed") return "Mixed";
  return "Automatic";
}

/** Table column display: Automatic, Manual, Mixed, or em dash when no scripts. */
export function scriptSourceColumnValue(source: MarkingScriptSource | "mixed" | null): string {
  if (!source) return "—";
  return scriptSourceLabel(source);
}

export function scriptSourceSummary(
  breakdowns: SubjectMarkingBreakdownRow[],
  opts?: { subjectId?: number | null; paperNumber?: number | null },
): MarkingScriptSource | "mixed" | null {
  let relevant = breakdowns.filter((b) => b.allocated_booklets > 0);
  if (opts?.subjectId != null) {
    relevant = relevant.filter((b) => b.subject_id === opts.subjectId);
    if (opts.paperNumber != null) {
      relevant = relevant.filter((b) => b.paper_number === opts.paperNumber);
    }
  }
  if (relevant.length === 0) return null;
  const sources = new Set(relevant.map((b) => (b.script_source === "manual" ? "manual" : "allocation")));
  if (sources.size > 1) return "mixed";
  return sources.has("manual") ? "manual" : "allocation";
}
