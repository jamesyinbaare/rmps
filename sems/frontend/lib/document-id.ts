import { schoolPrefixForSheetId } from "@/lib/schoolCode";
import type { School, Subject } from "@/types/document";

export type DocumentIdValidation = {
  error: string | null;
  schoolId?: number;
  subjectId?: number;
};

export type DocumentIdParts = {
  schoolCode: string;
  subjectCode: string;
  series: string;
  testType: string;
  sheetNumber: string;
};

export type DocumentIdPartStatus = "pending" | "ok" | "unknown";

export type ResolvedDocumentIdPart = {
  key: "school" | "subject" | "series" | "type" | "sheet";
  label: string;
  digits: string;
  /** Expected segment length in the full ID. */
  expectedLength: number;
  /** Inclusive start index of this segment in the 13-digit ID. */
  startIndex: number;
  /** Exclusive end index of this segment in the 13-digit ID. */
  endIndex: number;
  display: string | null;
  status: DocumentIdPartStatus;
};

const SEGMENT_LENGTHS = {
  school: 6,
  subject: 3,
  series: 1,
  type: 1,
  sheet: 2,
} as const;

const SEGMENT_RANGES = {
  school: { start: 0, end: 6 },
  subject: { start: 6, end: 9 },
  series: { start: 9, end: 10 },
  type: { start: 10, end: 11 },
  sheet: { start: 11, end: 13 },
} as const;

/** Slice digit string into ID segments; incomplete segments are partial or empty. */
export function parseDocumentIdParts(id: string): DocumentIdParts {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  return {
    schoolCode: digits.slice(0, 6),
    subjectCode: digits.slice(6, 9),
    series: digits.slice(9, 10),
    testType: digits.slice(10, 11),
    sheetNumber: digits.slice(11, 13),
  };
}

function partStatus(
  digits: string,
  expectedLength: number,
  isValid: boolean
): DocumentIdPartStatus {
  if (digits.length < expectedLength) return "pending";
  return isValid ? "ok" : "unknown";
}

/** Resolve typed ID segments against schools/subjects for live UI feedback. */
export function resolveDocumentIdParts(
  id: string,
  schools: School[],
  subjects: Subject[]
): ResolvedDocumentIdPart[] {
  const parts = parseDocumentIdParts(id);

  const school =
    parts.schoolCode.length === SEGMENT_LENGTHS.school
      ? schools.find((s) => schoolPrefixForSheetId(s.s_code) === parts.schoolCode)
      : undefined;
  const subject =
    parts.subjectCode.length === SEGMENT_LENGTHS.subject
      ? subjects.find((s) => s.code === parts.subjectCode)
      : undefined;

  const seriesNum = parts.series.length === 1 ? parseInt(parts.series, 10) : NaN;
  const seriesOk = !isNaN(seriesNum) && seriesNum >= 1 && seriesNum <= 9;

  const typeOk = parts.testType === "1" || parts.testType === "2";
  const typeDisplay =
    parts.testType === "1"
      ? "Objectives"
      : parts.testType === "2"
        ? "Essay"
        : null;

  const sheetNum =
    parts.sheetNumber.length === SEGMENT_LENGTHS.sheet
      ? parseInt(parts.sheetNumber, 10)
      : NaN;
  const sheetOk = !isNaN(sheetNum) && sheetNum >= 1 && sheetNum <= 99;

  return [
    {
      key: "school",
      label: "School",
      digits: parts.schoolCode,
      expectedLength: SEGMENT_LENGTHS.school,
      startIndex: SEGMENT_RANGES.school.start,
      endIndex: SEGMENT_RANGES.school.end,
      display: school?.name ?? null,
      status: partStatus(parts.schoolCode, SEGMENT_LENGTHS.school, !!school),
    },
    {
      key: "subject",
      label: "Subject",
      digits: parts.subjectCode,
      expectedLength: SEGMENT_LENGTHS.subject,
      startIndex: SEGMENT_RANGES.subject.start,
      endIndex: SEGMENT_RANGES.subject.end,
      display: subject?.name ?? null,
      status: partStatus(parts.subjectCode, SEGMENT_LENGTHS.subject, !!subject),
    },
    {
      key: "series",
      label: "Series",
      digits: parts.series,
      expectedLength: SEGMENT_LENGTHS.series,
      startIndex: SEGMENT_RANGES.series.start,
      endIndex: SEGMENT_RANGES.series.end,
      display: seriesOk ? `Series ${parts.series}` : null,
      status: partStatus(parts.series, SEGMENT_LENGTHS.series, seriesOk),
    },
    {
      key: "type",
      label: "Type",
      digits: parts.testType,
      expectedLength: SEGMENT_LENGTHS.type,
      startIndex: SEGMENT_RANGES.type.start,
      endIndex: SEGMENT_RANGES.type.end,
      display: typeDisplay,
      status: partStatus(parts.testType, SEGMENT_LENGTHS.type, typeOk),
    },
    {
      key: "sheet",
      label: "Sheet",
      digits: parts.sheetNumber,
      expectedLength: SEGMENT_LENGTHS.sheet,
      startIndex: SEGMENT_RANGES.sheet.start,
      endIndex: SEGMENT_RANGES.sheet.end,
      display: sheetOk ? `Page ${sheetNum}` : null,
      status: partStatus(parts.sheetNumber, SEGMENT_LENGTHS.sheet, sheetOk),
    },
  ];
}

export function validateDocumentId(
  id: string,
  schools: School[],
  subjects: Subject[]
): DocumentIdValidation {
  if (!id.trim()) {
    return { error: "Please enter a document ID" };
  }

  const trimmedId = id.trim();

  if (trimmedId.length !== 13) {
    return { error: "ID must be exactly 13 characters" };
  }

  if (!/^\d+$/.test(trimmedId)) {
    return { error: "ID must contain only digits" };
  }

  const schoolCode = trimmedId.substring(0, 6);
  const subjectCode = trimmedId.substring(6, 9);
  const subjectSeries = trimmedId.substring(9, 10);
  const testType = trimmedId.substring(10, 11);
  const sheetNumber = trimmedId.substring(11, 13);

  const seriesNum = parseInt(subjectSeries, 10);
  if (isNaN(seriesNum) || seriesNum < 1 || seriesNum > 9) {
    return { error: "Subject series must be between 1 and 9" };
  }

  if (testType !== "1" && testType !== "2") {
    return { error: "Test type must be 1 (Objectives) or 2 (Essay)" };
  }

  const sheetNum = parseInt(sheetNumber, 10);
  if (isNaN(sheetNum) || sheetNum < 1 || sheetNum > 99) {
    return { error: "Sheet number must be between 01 and 99" };
  }

  const school = schools.find((s) => schoolPrefixForSheetId(s.s_code) === schoolCode);
  if (!school) {
    return { error: `School numeric prefix ${schoolCode} not found` };
  }

  const subject = subjects.find((s) => s.code === subjectCode);
  if (!subject) {
    return { error: `Subject code ${subjectCode} not found` };
  }

  return { error: null, schoolId: school.id, subjectId: subject.id };
}
