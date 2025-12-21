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
  ProgrammeBulkUploadResponse,
  Candidate,
  CandidateBulkUploadResponse,
  CandidateListResponse,
  SubjectBulkUploadResponse,
  SchoolBulkUploadResponse,
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
    (e) => e.exam_type === examType && e.series === series && e.year === year
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

  // Return exams sorted by exam_type
  return exams.sort((a, b) => a.exam_type.localeCompare(b.exam_type));
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

export async function createProgramme(data: { name: string; code: string; exam_type?: ExamType | null }): Promise<Programme> {
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
  data: { name?: string; code?: string; exam_type?: ExamType | null }
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

export async function uploadProgrammesBulk(file: File): Promise<ProgrammeBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ProgrammeBulkUploadResponse>(response);
}

export async function downloadProgrammeTemplate(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/template`);
  if (!response.ok) {
    // Try to parse JSON error, but handle case where response might not be JSON
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const error: ApiError = await response.json();
      errorMessage = error.detail || errorMessage;
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.blob();
}

// Programme Subject API Functions
export type SubjectType = "CORE" | "ELECTIVE";

export interface ProgrammeSubject {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: SubjectType;
  is_compulsory: boolean | null;
  choice_group_id: number | null;
  created_at: string;
}

export async function listProgrammeSubjects(programmeId: number): Promise<ProgrammeSubject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects`);
  return handleResponse<ProgrammeSubject[]>(response);
}

export interface ProgrammeSubjectAssociationCreate {
  is_compulsory?: boolean | null;
  choice_group_id?: number | null;
}

export interface ProgrammeSubjectAssociationUpdate {
  is_compulsory?: boolean | null;
  choice_group_id?: number | null;
}

export interface ProgrammeSubjectAssociation {
  programme_id: number;
  subject_id: number;
  subject_type: SubjectType;
  is_compulsory: boolean | null;
  choice_group_id: number | null;
}

export async function addSubjectToProgramme(
  programmeId: number,
  subjectId: number,
  associationData?: ProgrammeSubjectAssociationCreate
): Promise<ProgrammeSubjectAssociation> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects/${subjectId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(associationData || {}),
    }
  );
  return handleResponse<ProgrammeSubjectAssociation>(response);
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
  updateData: ProgrammeSubjectAssociationUpdate
): Promise<ProgrammeSubjectAssociation> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subjects/${subjectId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateData),
    }
  );
  return handleResponse<ProgrammeSubjectAssociation>(response);
}

export interface SubjectChoiceGroup {
  choice_group_id: number;
  subjects: ProgrammeSubject[];
}

export interface ProgrammeSubjectRequirements {
  compulsory_core: ProgrammeSubject[];
  optional_core_groups: SubjectChoiceGroup[];
  electives: ProgrammeSubject[];
}

export async function getProgrammeSubjectRequirements(
  programmeId: number
): Promise<ProgrammeSubjectRequirements> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/programmes/${programmeId}/subject-requirements`
  );
  return handleResponse<ProgrammeSubjectRequirements>(response);
}

export interface SubjectRequirementsValidationResponse {
  is_valid: boolean;
  exam_series: string;
  is_applicable: boolean;
  errors: string[];
  programme_id: number | null;
  programme_name: string | null;
}

export async function validateCandidateSubjectRequirements(
  candidateId: number,
  examId: number
): Promise<SubjectRequirementsValidationResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/candidates/${candidateId}/exams/${examId}/subject-requirements-validation`
  );
  return handleResponse<SubjectRequirementsValidationResponse>(response);
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
  school_type?: "private" | "public" | null;
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

export async function updateSchool(
  code: string,
  data: {
    name?: string;
    region?: string;
    zone?: string;
    school_type?: "private" | "public" | null;
  }
): Promise<School> {
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

export async function uploadSchoolsBulk(file: File): Promise<SchoolBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/schools/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<SchoolBulkUploadResponse>(response);
}

export async function downloadSchoolTemplate(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/schools/template`);
  if (!response.ok) {
    // Try to parse JSON error, but handle case where response might not be JSON
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const error: ApiError = await response.json();
      errorMessage = error.detail || errorMessage;
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.blob();
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
  original_code: string;
  name: string;
  subject_type: "CORE" | "ELECTIVE";
  exam_type: ExamType;
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
  data: { name?: string; original_code?: string; subject_type?: "CORE" | "ELECTIVE"; exam_type?: ExamType }
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

  // 204 No Content means success
  if (response.status === 204) {
    return;
  }

  // For any other status, try to parse error message
  if (!response.ok) {
    let errorDetail = `Failed to delete subject`;
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const error: ApiError = await response.json();
        errorDetail = error.detail || errorDetail;
      } else {
        const text = await response.text();
        if (text && text.trim()) {
          errorDetail = text.trim();
        } else {
          // Provide specific messages based on status code
          switch (response.status) {
            case 400:
              errorDetail = "Cannot delete subject. It is still referenced by other records (exam subjects, documents, or programme associations).";
              break;
            case 404:
              errorDetail = "Subject not found";
              break;
            case 500:
              errorDetail = "An internal server error occurred while deleting the subject";
              break;
            default:
              errorDetail = `Failed to delete subject (HTTP ${response.status})`;
          }
        }
      }
    } catch (parseError) {
      // If parsing fails, provide a generic message
      errorDetail = `Failed to delete subject (HTTP ${response.status})`;
    }
    throw new Error(errorDetail);
  }
}

export async function uploadSubjectsBulk(file: File): Promise<SubjectBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/subjects/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<SubjectBulkUploadResponse>(response);
}

export async function downloadSubjectTemplate(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/subjects/template`);
  if (!response.ok) {
    // Try to parse JSON error, but handle case where response might not be JSON
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const error: ApiError = await response.json();
      errorMessage = error.detail || errorMessage;
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.blob();
}

// Exam CRUD API Functions

export async function getExam(id: number): Promise<Exam> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${id}`);
  return handleResponse<Exam>(response);
}

export async function createExam(data: {
  exam_type: string;
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
    exam_type?: string;
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
