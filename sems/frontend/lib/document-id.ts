import { schoolPrefixForSheetId } from "@/lib/schoolCode";
import type { School, Subject } from "@/types/document";

export type DocumentIdValidation = {
  error: string | null;
  schoolId?: number;
  subjectId?: number;
};

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
