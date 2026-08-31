/**
 * Client-side helpers for export column-shape preview (matches backend results_export).
 */

export type ExportPaper = "obj" | "essay";
export type ExportFormat = "standard" | "multi_subject";
export type ExportScopeMode = "CORE" | "ELECTIVE" | "subject" | null;

export function componentIndex(originalCode: string | null | undefined): number | null {
  if (!originalCode) return null;
  const last = originalCode.slice(-1);
  return /^\d$/.test(last) ? Number(last) : null;
}

export function electiveComponentHeaders(
  componentIndices: number[],
  papers: ExportPaper[]
): string[] {
  const headers: string[] = [];
  for (const n of componentIndices) {
    headers.push(`COMPONENT_${n}`);
    if (papers.includes("obj")) headers.push(`COMPONENT_${n}_OBJ_SCORE`);
    if (papers.includes("essay")) headers.push(`COMPONENT_${n}_ESSAY_SCORE`);
  }
  return headers;
}

export function coreSubjectHeaders(subjectCodes: string[], papers: ExportPaper[]): string[] {
  const headers: string[] = [];
  for (const code of subjectCodes) {
    if (papers.length === 1) {
      headers.push(code);
    } else {
      if (papers.includes("obj")) headers.push(`${code}_OBJ`);
      if (papers.includes("essay")) headers.push(`${code}_ESSAY`);
    }
  }
  return headers;
}

export function componentIndicesFromCodes(codes: string[]): number[] {
  const indices = new Set<number>();
  for (const code of codes) {
    const idx = componentIndex(code);
    if (idx != null) indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export type ColumnShapeResult = {
  mode: "standard" | "component" | "wide" | "pending";
  headers: string[];
  summary: string;
};

export function buildExportColumnShape(args: {
  format: ExportFormat;
  scopeMode: ExportScopeMode;
  papers: ExportPaper[];
  /** Subject original_codes for CORE / subject multi-select */
  subjectCodes?: string[];
  /** Elective original_codes used to derive component indices */
  electiveCodes?: string[];
  fieldCount?: number;
}): ColumnShapeResult {
  const { format, scopeMode, papers, subjectCodes = [], electiveCodes = [], fieldCount } = args;

  if (format === "standard") {
    return {
      mode: "standard",
      headers: [],
      summary:
        fieldCount != null
          ? `One sheet per subject · ${fieldCount} field${fieldCount === 1 ? "" : "s"}`
          : "One sheet per subject · selected fields",
    };
  }

  if (papers.length === 0) {
    return {
      mode: "pending",
      headers: [],
      summary: "Select at least one paper for score columns",
    };
  }

  const useComponent =
    scopeMode === "ELECTIVE" ||
    (scopeMode === "subject" &&
      electiveCodes.length > 0 &&
      subjectCodes.length > 0 &&
      subjectCodes.every((code) => electiveCodes.includes(code)));

  // Explicit elective scope → component layout
  if (scopeMode === "ELECTIVE") {
    const indices = componentIndicesFromCodes(electiveCodes);
    if (indices.length === 0) {
      return {
        mode: "component",
        headers: [],
        summary:
          "Component columns (COMPONENT_1, COMPONENT_2, …) from elective subject codes ending in a digit",
      };
    }
    const headers = electiveComponentHeaders(indices, papers);
    return {
      mode: "component",
      headers,
      summary: `${indices.length} component slot${indices.length === 1 ? "" : "s"} · ${papers.length === 2 ? "OBJ + Essay" : papers[0] === "obj" ? "OBJ only" : "Essay only"}`,
    };
  }

  // Subject multi-select: component if all selected look elective by digit codes alone we still use wide layout unless all are electives — caller passes useComponent via electiveCodes match
  if (scopeMode === "subject" && useComponent) {
    const indices = componentIndicesFromCodes(subjectCodes);
    if (indices.length > 0) {
      const headers = electiveComponentHeaders(indices, papers);
      return {
        mode: "component",
        headers,
        summary: `Component layout · ${headers.length} score columns`,
      };
    }
  }

  if (subjectCodes.length === 0) {
    if (scopeMode === "CORE") {
      return {
        mode: "wide",
        headers: [],
        summary:
          papers.length === 2
            ? "One column pair per core subject (_OBJ / _ESSAY)"
            : `One column per core subject (${papers[0] === "obj" ? "OBJ" : "Essay"})`,
      };
    }
    return {
      mode: "pending",
      headers: [],
      summary: "Select subjects to preview column headers",
    };
  }

  const headers = coreSubjectHeaders(subjectCodes, papers);
  return {
    mode: "wide",
    headers,
    summary: `${subjectCodes.length} subject column${subjectCodes.length === 1 ? "" : "s"} · ${papers.length === 2 ? "OBJ + Essay" : papers[0] === "obj" ? "OBJ" : "Essay"}`,
  };
}
