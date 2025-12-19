import type {
  Document,
  DocumentFilters,
  DocumentListResponse,
  BulkUploadResponse,
  Exam,
  ExamListResponse,
  ExamType,
  ExamSeries,
  School,
  Subject,
  ApiError,
  Programme,
  ProgrammeListResponse,
  Candidate,
  CandidateBulkUploadResponse,
  CandidateListResponse,
  ExamRegistration,
  SubjectRegistration,
  ScoreDocumentFilters,
  DocumentScoresResponse,
  ScoreResponse,
  ScoreUpdate,
  BatchScoreUpdate,
  BatchScoreUpdateResponse,
  ReductoQueueResponse,
  ReductoStatusResponse,
  ManualEntryFilters,
  CandidateScoreListResponse,
} from "@/types/document";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetail = `HTTP error! status: ${response.status}`;
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const error: ApiError = await response.json();
        errorDetail = error.detail || errorDetail;
      } else {
        const text = await response.text();
        errorDetail = text || errorDetail;
      }
    } catch (e) {
      // If we can't parse the error, use the default message
      errorDetail = `HTTP error! status: ${response.status}`;
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

export async function listDocuments(
  filters: DocumentFilters = {}
): Promise<DocumentListResponse> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.series) params.append("series", filters.series);
  if (filters.year) params.append("year", filters.year.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/documents?${params.toString()}`);
  return handleResponse<DocumentListResponse>(response);
}

export async function uploadDocument(file: File, examId: number): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_id", examId.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/documents/upload`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<Document>(response);
}

export async function bulkUploadDocuments(files: File[], examId: number): Promise<BulkUploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("exam_id", examId.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/documents/bulk-upload`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<BulkUploadResponse>(response);
}

export async function downloadDocument(documentId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/download`);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

export async function listExams(
  examType: string,
  series: string,
  year: number,
  page = 1,
  pageSize = 100
): Promise<ExamListResponse> {
  // Backend limits page_size to max 100, so cap it here
  const cappedPageSize = Math.min(pageSize, 100);
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", cappedPageSize.toString());
  params.append("exam_type", examType);
  params.append("series", series);
  params.append("year", year.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/exams?${params.toString()}`);
  return handleResponse<ExamListResponse>(response);
}

export async function listSchools(page = 1, pageSize = 100): Promise<School[]> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/schools?${params.toString()}`);
  return handleResponse<School[]>(response);
}

export async function getSchoolById(id: number): Promise<School | null> {
  // Backend uses school_code, so we need to fetch all schools and find by ID
  // This is not ideal but works with the current API structure
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const schools = await listSchools(page, 100);
    const school = schools.find((s) => s.id === id);
    if (school) {
      return school;
    }
    hasMore = schools.length === 100;
    page++;
  }

  return null;
}

export async function listSubjects(page = 1, pageSize = 100): Promise<Subject[]> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/subjects?${params.toString()}`);
  return handleResponse<Subject[]>(response);
}

/**
 * Get all exams by fetching for all combinations of type, series, and year
 * This is a helper function for components that need to list all available exams
 */
export async function getAllExams(): Promise<Exam[]> {
  const allExamsList: Exam[] = [];
  const examTypes: ExamType[] = ["Certificate II Examination", "CBT"];
  const series: ExamSeries[] = ["MAY/JUNE", "NOV/DEC"];
  const currentYear = new Date().getFullYear();
  // Fetch exams for current year and a few years around it
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  // Fetch exams for all combinations
  for (const examType of examTypes) {
    for (const ser of series) {
      for (const year of years) {
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const response = await listExams(examType, ser, year, page, 100);
            allExamsList.push(...response.items);
            hasMore = page < response.total_pages;
            page++;
          }
        } catch (err) {
          // Skip if no exams found for this combination
          continue;
        }
      }
    }
  }

  return allExamsList;
}

/**
 * Find exam_id from exam_type, series, and year
 * @param exams - Array of exams to search through
 * @param examType - Examination type
 * @param series - Examination series
 * @param year - Examination year
 * @returns exam_id if found, null otherwise
 */
export function findExamId(
  exams: Exam[],
  examType: ExamType,
  series: ExamSeries,
  year: number
): number | null {
  const exam = exams.find(
    (e) => e.name === examType && e.series === series && e.year === year
  );
  return exam ? exam.id : null;
}

/**
 * Get exams that have at least one document
 * Fetches exam details by ID from documents since listExams now requires filters
 */
export async function getExamsWithDocuments(): Promise<Exam[]> {
  // Get all documents to find which exams have documents
  const documentsResponse = await listDocuments({ page: 1, page_size: 100 });
  const examIdsWithDocs = new Set<number>();
  documentsResponse.items.forEach((doc) => {
    examIdsWithDocs.add(doc.exam_id);
  });

  // Paginate through all documents to get complete list
  if (documentsResponse.total_pages > 1) {
    let docPage = 2;
    while (docPage <= documentsResponse.total_pages) {
      const moreDocs = await listDocuments({ page: docPage, page_size: 100 });
      moreDocs.items.forEach((doc) => {
        examIdsWithDocs.add(doc.exam_id);
      });
      docPage++;
    }
  }

  // Fetch exam details for each exam ID
  const exams: Exam[] = [];
  for (const examId of examIdsWithDocs) {
    try {
      const exam = await getExam(examId);
      exams.push(exam);
    } catch (error) {
      // Skip if exam not found
      continue;
    }
  }

  // Return exams sorted by name
  return exams.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get schools for an exam that have documents
 */
export async function getSchoolsForExam(examId: number): Promise<School[]> {
  const schoolsMap = new Map<number, School>();
  let page = 1;
  let hasMore = true;

  // Fetch all schools
  while (hasMore) {
    const schools = await listSchools(page, 100);
    schools.forEach((school) => {
      schoolsMap.set(school.id, school);
    });
    hasMore = schools.length === 100;
    page++;
  }

  // Get documents for this exam
  const documentsResponse = await listDocuments({ exam_id: examId, page: 1, page_size: 100 });
  const schoolIdsWithDocs = new Set<number>();
  documentsResponse.items.forEach((doc) => {
    if (doc.school_id) {
      schoolIdsWithDocs.add(doc.school_id);
    }
  });

  // Paginate through all documents for this exam
  if (documentsResponse.total_pages > 1) {
    let docPage = 2;
    while (docPage <= documentsResponse.total_pages) {
      const moreDocs = await listDocuments({ exam_id: examId, page: docPage, page_size: 100 });
      moreDocs.items.forEach((doc) => {
        if (doc.school_id) {
          schoolIdsWithDocs.add(doc.school_id);
        }
      });
      docPage++;
    }
  }

  // Return only schools that have documents for this exam
  return Array.from(schoolIdsWithDocs)
    .map((schoolId) => schoolsMap.get(schoolId))
    .filter((school): school is School => school !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get subjects for an exam and school combination that have documents
 */
export async function getSubjectsForExamAndSchool(
  examId: number,
  schoolId: number
): Promise<Subject[]> {
  const subjectsMap = new Map<number, Subject>();
  let page = 1;
  let hasMore = true;

  // Fetch all subjects
  while (hasMore) {
    const subjects = await listSubjects(page, 100);
    subjects.forEach((subject) => {
      subjectsMap.set(subject.id, subject);
    });
    hasMore = subjects.length === 100;
    page++;
  }

  // Get documents for this exam and school
  const documentsResponse = await listDocuments({
    exam_id: examId,
    school_id: schoolId,
    page: 1,
    page_size: 100,
  });
  const subjectIdsWithDocs = new Set<number>();
  documentsResponse.items.forEach((doc) => {
    if (doc.subject_id) {
      subjectIdsWithDocs.add(doc.subject_id);
    }
  });

  // Paginate through all documents for this exam and school
  if (documentsResponse.total_pages > 1) {
    let docPage = 2;
    while (docPage <= documentsResponse.total_pages) {
      const moreDocs = await listDocuments({
        exam_id: examId,
        school_id: schoolId,
        page: docPage,
        page_size: 100,
      });
      moreDocs.items.forEach((doc) => {
        if (doc.subject_id) {
          subjectIdsWithDocs.add(doc.subject_id);
        }
      });
      docPage++;
    }
  }

  // Return only subjects that have documents for this exam and school
  return Array.from(subjectIdsWithDocs)
    .map((subjectId) => subjectsMap.get(subjectId))
    .filter((subject): subject is Subject => subject !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Programme API Functions

export async function listProgrammes(page = 1, pageSize = 100): Promise<ProgrammeListResponse> {
  const cappedPageSize = Math.min(pageSize, 100);
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", cappedPageSize.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/programmes?${params.toString()}`);
  return handleResponse<ProgrammeListResponse>(response);
}

export async function getProgramme(id: number): Promise<Programme> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${id}`);
  return handleResponse<Programme>(response);
}

export async function createProgramme(data: { name: string; code: string }): Promise<Programme> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Programme>(response);
}

export async function updateProgramme(
  id: number,
  data: { name?: string; code?: string }
): Promise<Programme> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Programme>(response);
}

export async function deleteProgramme(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

// Programme Subject API Functions
export type SubjectType = "CORE" | "ELECTIVE";

export interface ProgrammeSubject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: SubjectType;
  created_at: string;
}

export async function listProgrammeSubjects(programmeId: number): Promise<ProgrammeSubject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects`);
  return handleResponse<ProgrammeSubject[]>(response);
}

export async function addSubjectToProgramme(
  programmeId: number,
  subjectId: number
): Promise<{ programme_id: number; subject_id: number; subject_type: SubjectType }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects/${subjectId}`,
    {
      method: "POST",
    }
  );
  return handleResponse<{ programme_id: number; subject_id: number; subject_type: SubjectType }>(response);
}

export async function removeSubjectFromProgramme(
  programmeId: number,
  subjectId: number
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects/${subjectId}`,
    {
      method: "DELETE",
    }
  );
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export async function updateProgrammeSubject(
  programmeId: number,
  subjectId: number,
  subjectType: SubjectType
): Promise<{ programme_id: number; subject_id: number; subject_type: SubjectType }> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects/${subjectId}?subject_type=${subjectType}`,
    {
      method: "PUT",
    }
  );
  return handleResponse<{ programme_id: number; subject_id: number; subject_type: SubjectType }>(response);
}

// Candidate API Functions

export async function listCandidates(
  page = 1,
  pageSize = 20,
  schoolId?: number,
  programmeId?: number
): Promise<CandidateListResponse> {
  const cappedPageSize = Math.min(pageSize, 100);
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", cappedPageSize.toString());
  if (schoolId !== undefined) {
    params.append("school_id", schoolId.toString());
  }
  if (programmeId !== undefined) {
    params.append("programme_id", programmeId.toString());
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates?${params.toString()}`);
  return handleResponse<CandidateListResponse>(response);
}

export async function getCandidate(id: number): Promise<Candidate> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${id}`);
  return handleResponse<Candidate>(response);
}

export async function createCandidate(data: {
  school_id: number;
  name: string;
  index_number: string;
  date_of_birth?: string | null;
  gender?: string | null;
  programme_id?: number | null;
}): Promise<Candidate> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Candidate>(response);
}

export async function updateCandidate(
  id: number,
  data: {
    school_id?: number;
    name?: string;
    index_number?: string;
    date_of_birth?: string | null;
    gender?: string | null;
    programme_id?: number | null;
  }
): Promise<Candidate> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Candidate>(response);
}

export async function deleteCandidate(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export async function uploadCandidatesBulk(file: File, examId: number): Promise<CandidateBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_id", examId.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<CandidateBulkUploadResponse>(response);
}

// School Management API Functions

export async function createSchool(data: {
  code: string;
  name: string;
  region: string;
  zone: string;
}): Promise<School> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<School>(response);
}

export async function getSchoolByCode(code: string): Promise<School> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${code}`);
  return handleResponse<School>(response);
}

export async function updateSchool(code: string, data: { name?: string }): Promise<School> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${code}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<School>(response);
}

export async function deleteSchool(code: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${code}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export async function listSchoolProgrammes(schoolId: number): Promise<Programme[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${schoolId}/programmes`);
  return handleResponse<Programme[]>(response);
}

export async function associateProgrammeWithSchool(
  schoolId: number,
  programmeId: number
): Promise<{ school_id: number; programme_id: number }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${schoolId}/programmes/${programmeId}`, {
    method: "POST",
  });
  return handleResponse<{ school_id: number; programme_id: number }>(response);
}

export async function removeProgrammeFromSchool(schoolId: number, programmeId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/${schoolId}/programmes/${programmeId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

// Programme-School Association API Functions

export async function listProgrammeSchools(programmeId: number): Promise<School[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${programmeId}/schools`);
  return handleResponse<School[]>(response);
}

export async function associateSchoolWithProgramme(
  programmeId: number,
  schoolId: number
): Promise<{ school_id: number; programme_id: number }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${programmeId}/schools/${schoolId}`, {
    method: "POST",
  });
  return handleResponse<{ school_id: number; programme_id: number }>(response);
}

export async function removeSchoolFromProgramme(programmeId: number, schoolId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${programmeId}/schools/${schoolId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

// Candidate Exam Registration API Functions

export async function listCandidateExamRegistrations(candidateId: number): Promise<ExamRegistration[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/exams`);
  return handleResponse<ExamRegistration[]>(response);
}

export async function listExamRegistrationSubjects(
  candidateId: number,
  examId: number
): Promise<SubjectRegistration[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/exams/${examId}/subjects`);
  return handleResponse<SubjectRegistration[]>(response);
}

// Subject CRUD API Functions

export async function getSubject(id: number): Promise<Subject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/subjects/${id}`);
  return handleResponse<Subject>(response);
}

export async function createSubject(data: {
  code: string;
  name: string;
  subject_type: "CORE" | "ELECTIVE";
}): Promise<Subject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/subjects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Subject>(response);
}

export async function updateSubject(
  id: number,
  data: { name?: string; subject_type?: "CORE" | "ELECTIVE" }
): Promise<Subject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/subjects/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Subject>(response);
}

export async function deleteSubject(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/subjects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

// Exam CRUD API Functions

export async function getExam(id: number): Promise<Exam> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${id}`);
  return handleResponse<Exam>(response);
}

export async function createExam(data: {
  name: string;
  description?: string | null;
  year: number;
  series: string;
  number_of_series: number;
}): Promise<Exam> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Exam>(response);
}

export async function updateExam(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    year?: number;
    series?: string;
    number_of_series?: number;
  }
): Promise<Exam> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Exam>(response);
}

export async function deleteExam(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export interface ExamSubject {
  id: number;
  exam_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: "CORE" | "ELECTIVE";
  obj_pct: number | null;
  essay_pct: number | null;
  pract_pct: number | null;
  obj_max_score: number | null;
  essay_max_score: number | null;
  pract_max_score: number | null;
  created_at: string;
  updated_at: string;
}

export async function listExamSubjects(examId: number): Promise<ExamSubject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/subjects`);
  return handleResponse<ExamSubject[]>(response);
}

export interface ExamSubjectUpdate {
  obj_pct?: number | null;
  essay_pct?: number | null;
  pract_pct?: number | null;
  obj_max_score?: number | null;
  essay_max_score?: number | null;
  pract_max_score?: number | null;
}

export async function updateExamSubject(
  examId: number,
  subjectId: number,
  data: ExamSubjectUpdate
): Promise<ExamSubject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/subjects/${subjectId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ExamSubject>(response);
}

// Score-related API functions

export async function getFilteredDocuments(
  filters: ScoreDocumentFilters = {}
): Promise<DocumentListResponse> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.series) params.append("series", filters.series);
  if (filters.year) params.append("year", filters.year.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.test_type) params.append("test_type", filters.test_type);
  if (filters.extraction_status) params.append("extraction_status", filters.extraction_status);
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents?${params.toString()}`);
  return handleResponse<DocumentListResponse>(response);
}

export async function getDocumentScores(documentId: string): Promise<DocumentScoresResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents/${documentId}/scores`);
  return handleResponse<DocumentScoresResponse>(response);
}

export async function updateScore(scoreId: number, data: ScoreUpdate): Promise<ScoreResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/scores/${scoreId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ScoreResponse>(response);
}

export async function batchUpdateScores(
  documentId: string,
  data: BatchScoreUpdate
): Promise<BatchScoreUpdateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents/${documentId}/scores/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<BatchScoreUpdateResponse>(response);
}

// Reducto Queue API Functions

export async function queueReductoExtraction(
  documentIds: number[]
): Promise<ReductoQueueResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/queue-reducto-extraction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  return handleResponse<ReductoQueueResponse>(response);
}

export async function getReductoStatus(documentId: number): Promise<ReductoStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/reducto-status`);
  return handleResponse<ReductoStatusResponse>(response);
}

// Manual Entry API Functions

export async function getCandidatesForManualEntry(
  filters: ManualEntryFilters = {}
): Promise<CandidateScoreListResponse> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.series) params.append("series", filters.series);
  if (filters.year) params.append("year", filters.year.toString());
  if (filters.programme_id) params.append("programme_id", filters.programme_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/scores/candidates?${params.toString()}`);
  return handleResponse<CandidateScoreListResponse>(response);
}

export async function batchUpdateScoresForManualEntry(
  data: BatchScoreUpdate
): Promise<BatchScoreUpdateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/manual-entry/batch-update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<BatchScoreUpdateResponse>(response);
}
