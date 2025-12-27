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
  ReductoDataResponse,
  UpdateScoresFromReductoResponse,
  UnmatchedExtractionRecord,
  UnmatchedRecordsListResponse,
  ResolveUnmatchedRecordRequest,
  SubjectScoreValidationIssue,
  ValidationIssueListResponse,
  ValidationIssueDetailResponse,
  RunValidationRequest,
  RunValidationResponse,
  ValidationIssuesFilters,
} from "@/types/document";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetail = `HTTP error! status: ${response.status}`;
    try {
      const contentType = response.headers.get("content-type");
      const text = await response.text();

      if (contentType && contentType.includes("application/json") && text) {
        try {
          const error: ApiError = JSON.parse(text);
          // FastAPI returns errors with a "detail" field
          errorDetail = error.detail || error.message || text;
        } catch {
          // If JSON parsing fails, use the text as-is
          errorDetail = text;
        }
      } else if (text) {
        errorDetail = text;
      }
    } catch (e) {
      // If we can't read the response, use the default message
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
  if (filters.id_extraction_status) params.append("id_extraction_status", filters.id_extraction_status);
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

export async function getDocument(documentId: number): Promise<Document> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`);
  return handleResponse<Document>(response);
}

export async function downloadDocument(documentId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/download`);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

export async function deleteDocument(documentId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export async function updateDocumentId(
  documentId: number,
  extractedId: string,
  schoolId?: number,
  subjectId?: number
): Promise<Document> {
  const body: any = {
    extracted_id: extractedId,
    id_extraction_status: "success"
  };

  if (schoolId !== undefined) {
    body.school_id = schoolId;
  }

  if (subjectId !== undefined) {
    body.subject_id = subjectId;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/id`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handleResponse<Document>(response);
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

export async function downloadExamSubjectTemplate(
  examId: number,
  subjectType?: "CORE" | "ELECTIVE"
): Promise<Blob> {
  let url = `${API_BASE_URL}/api/v1/exams/${examId}/subjects/template`;
  if (subjectType) {
    url += `?subject_type=${subjectType}`;
  }
  const response = await fetch(url);
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

export interface ExamSubjectBulkUploadError {
  row_number: number;
  original_code: string;
  error_message: string;
  field: string | null;
}

export interface ExamSubjectBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ExamSubjectBulkUploadError[];
}

export async function uploadExamSubjectsBulk(
  examId: number,
  file: File
): Promise<ExamSubjectBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/subjects/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ExamSubjectBulkUploadResponse>(response);
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

export interface SerializationResponse {
  exam_id: number;
  school_id: number | null;
  total_candidates_count: number;
  total_schools_count: number;
  subjects_serialized_count: number;
  subjects_defaulted_count: number;
  schools_processed: Array<{
    school_id: number;
    school_name: string;
    candidates_count: number;
  }>;
  subjects_processed: Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    candidates_count: number;
  }>;
  subjects_defaulted: Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    candidates_count: number;
  }>;
  message: string;
}

export async function serializeExam(
  examId: number,
  subjectCodes?: string[],
  schoolId?: number | null
): Promise<SerializationResponse> {
  const params = new URLSearchParams();
  if (schoolId !== undefined && schoolId !== null) {
    params.append("school_id", schoolId.toString());
  }
  if (subjectCodes && subjectCodes.length > 0) {
    subjectCodes.forEach((code) => {
      params.append("subject_codes", code);
    });
  }
  const url = `${API_BASE_URL}/api/v1/exams/${examId}/serialize${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
  });
  return handleResponse<SerializationResponse>(response);
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
  if (filters.extraction_method) params.append("extraction_method", filters.extraction_method);
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

export async function getReductoData(documentId: number): Promise<ReductoDataResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents/${documentId}/reducto-data`);
  return handleResponse<ReductoDataResponse>(response);
}

export async function updateScoresFromReducto(
  documentId: number
): Promise<UpdateScoresFromReductoResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents/${documentId}/update-from-reducto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return handleResponse<UpdateScoresFromReductoResponse>(response);
}

export interface UnmatchedRecordsFilters {
  document_id?: number;
  status?: "pending" | "resolved" | "ignored";
  extraction_method?: string;
  page?: number;
  page_size?: number;
}

export async function getUnmatchedRecords(
  filters: UnmatchedRecordsFilters = {}
): Promise<UnmatchedRecordsListResponse> {
  const params = new URLSearchParams();
  if (filters.document_id) params.append("document_id", filters.document_id.toString());
  if (filters.status) params.append("status", filters.status);
  if (filters.extraction_method) params.append("extraction_method", filters.extraction_method);
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/scores/unmatched-records?${params.toString()}`);
  return handleResponse<UnmatchedRecordsListResponse>(response);
}

export async function getUnmatchedRecord(recordId: number): Promise<UnmatchedExtractionRecord> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/unmatched-records/${recordId}`);
  return handleResponse<UnmatchedExtractionRecord>(response);
}

export async function resolveUnmatchedRecord(
  recordId: number,
  data: ResolveUnmatchedRecordRequest
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/unmatched-records/${recordId}/resolve`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  await handleResponse(response);
}

export async function markUnmatchedRecordResolved(recordId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/unmatched-records/${recordId}/mark-resolved`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
  await handleResponse(response);
}

export async function ignoreUnmatchedRecord(recordId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/unmatched-records/${recordId}/ignore`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
  await handleResponse(response);
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
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.programme_id) params.append("programme_id", filters.programme_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.document_id) params.append("document_id", filters.document_id);
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

// PDF Score Sheet Generation API Functions

export interface PdfGenerationResponse {
  exam_id: number;
  total_pdfs_generated: number;
  total_sheets_generated: number;
  total_candidates_assigned: number;
  schools_processed: Array<{
    school_id: number;
    school_name: string;
    pdfs_count: number;
    sheets_count: number;
    candidates_count: number;
  }>;
  subjects_processed: Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    pdfs_count: number;
    sheets_count: number;
    candidates_count: number;
  }>;
  sheets_by_series: Record<number, number>;
  message: string;
}

/**
 * Get schools that have candidates registered for an exam.
 */
export async function getSchoolsForExamWithCandidates(examId: number): Promise<School[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/schools`);
  return handleResponse<School[]>(response);
}

/**
 * Get subjects that a school has candidates registered for in an exam.
 */
export async function getSubjectsForExamAndSchoolByCandidates(
  examId: number,
  schoolId: number
): Promise<Subject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/schools/${schoolId}/subjects`);
  return handleResponse<Subject[]>(response);
}

/**
 * Generate PDF score sheets for an exam (existing endpoint).
 */
export async function generatePdfScoreSheets(
  examId: number,
  schoolId?: number | null,
  subjectId?: number | null,
  testTypes?: number[]
): Promise<PdfGenerationResponse> {
  const params = new URLSearchParams();
  if (schoolId !== undefined && schoolId !== null) {
    params.append("school_id", schoolId.toString());
  }
  if (subjectId !== undefined && subjectId !== null) {
    params.append("subject_id", subjectId.toString());
  }
  if (testTypes && testTypes.length > 0) {
    testTypes.forEach((type) => {
      params.append("test_types", type.toString());
    });
  }

  const url = `${API_BASE_URL}/api/v1/exams/${examId}/generate-pdf-score-sheets${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
  });
  return handleResponse<PdfGenerationResponse>(response);
}

/**
 * Generate PDF score sheets for a specific school and return combined PDF as blob.
 */
export async function generatePdfScoreSheetsCombined(
  examId: number,
  schoolId: number,
  subjectId?: number | null,
  testTypes?: number[]
): Promise<Blob> {
  const params = new URLSearchParams();
  params.append("school_id", schoolId.toString());
  if (subjectId !== undefined && subjectId !== null) {
    params.append("subject_id", subjectId.toString());
  }
  if (testTypes && testTypes.length > 0) {
    testTypes.forEach((type) => {
      params.append("test_types", type.toString());
    });
  }

  const url = `${API_BASE_URL}/api/v1/exams/${examId}/generate-pdf-score-sheets-combined?${params.toString()}`;
  const response = await fetch(url, {
    method: "POST",
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.blob();
}

// PDF Generation Job API Functions

export interface PdfGenerationJobResult {
  school_id: number;
  school_name: string;
  school_code: string;
  pdf_file_path: string | null;
  error: string | null;
}

export interface PdfGenerationJob {
  id: number;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  exam_id: number;
  school_ids: number[] | null;
  subject_id: number | null;
  test_types: number[];
  progress_current: number;
  progress_total: number;
  current_school_name: string | null;
  error_message: string | null;
  results: PdfGenerationJobResult[] | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PdfGenerationJobListResponse {
  items: PdfGenerationJob[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PdfGenerationJobCreate {
  school_ids?: number[] | null;
  subject_id?: number | null;
  test_types?: number[];
}

/**
 * Create a PDF generation job.
 */
export async function createPdfGenerationJob(
  examId: number,
  jobData: PdfGenerationJobCreate
): Promise<PdfGenerationJob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/generate-pdf-score-sheets-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jobData),
  });
  return handleResponse<PdfGenerationJob>(response);
}

/**
 * Get PDF generation job details.
 */
export async function getPdfGenerationJob(jobId: number): Promise<PdfGenerationJob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}`);
  return handleResponse<PdfGenerationJob>(response);
}

/**
 * List PDF generation jobs.
 */
export async function listPdfGenerationJobs(
  page: number = 1,
  pageSize: number = 20,
  statusFilter?: string
): Promise<PdfGenerationJobListResponse> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());
  if (statusFilter) {
    params.append("status_filter", statusFilter);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs?${params.toString()}`);
  return handleResponse<PdfGenerationJobListResponse>(response);
}

/**
 * Download PDF for a specific school from a job.
 */
export async function downloadJobSchoolPdf(jobId: number, schoolId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}/download/${schoolId}`);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

/**
 * Download all PDFs from a job as a ZIP file.
 */
export async function downloadJobAllPdfs(jobId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}/download-all`);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

/**
 * Cancel a PDF generation job.
 */
export async function cancelPdfGenerationJob(jobId: number): Promise<PdfGenerationJob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}/cancel`, {
    method: "POST",
  });
  return handleResponse<PdfGenerationJob>(response);
}

/**
 * Delete a PDF generation job.
 */
export async function deletePdfGenerationJob(jobId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

/**
 * Delete multiple PDF generation jobs.
 */
export async function deleteMultiplePdfGenerationJobs(jobIds: number[]): Promise<{ deleted_count: number; deleted_ids: number[] }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/delete-multiple`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_ids: jobIds }),
  });
  return handleResponse<{ deleted_count: number; deleted_ids: number[] }>(response);
}

// Validation Issues API Functions

export async function runValidation(
  request: RunValidationRequest = {}
): Promise<RunValidationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/validation/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return handleResponse<RunValidationResponse>(response);
}

export async function getValidationIssues(
  filters: ValidationIssuesFilters = {}
): Promise<ValidationIssueListResponse> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.status) params.append("status_filter", filters.status);
  if (filters.issue_type) params.append("issue_type", filters.issue_type);
  if (filters.test_type) params.append("test_type", filters.test_type.toString());
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/validation/issues?${params.toString()}`);
  return handleResponse<ValidationIssueListResponse>(response);
}

export async function getValidationIssue(issueId: number): Promise<ValidationIssueDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/validation/issues/${issueId}`);
  return handleResponse<ValidationIssueDetailResponse>(response);
}

export async function resolveValidationIssue(
  issueId: number,
  correctedScore?: string
): Promise<SubjectScoreValidationIssue> {
  const response = await fetch(`${API_BASE_URL}/api/v1/validation/issues/${issueId}/resolve`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      corrected_score: correctedScore !== undefined ? correctedScore : null,
    }),
  });
  return handleResponse<SubjectScoreValidationIssue>(response);
}

export async function ignoreValidationIssue(issueId: number): Promise<SubjectScoreValidationIssue> {
  const response = await fetch(`${API_BASE_URL}/api/v1/validation/issues/${issueId}/ignore`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return handleResponse<SubjectScoreValidationIssue>(response);
}

// Result Processing API Functions

export interface ProcessScoresBatchResponse {
  successful: number;
  failed: number;
  total: number;
  errors: Array<{ score_id: number; error: string }>;
}

export interface ProcessExamResultsResponse {
  message: string;
  successful: number;
  failed: number;
  total: number;
  errors: Array<{ score_id?: number; subject_registration_id?: number; error: string }>;
}

/**
 * Process a single subject score.
 */
export async function processScore(scoreId: number): Promise<ScoreResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/results/process/${scoreId}`, {
    method: "POST",
  });
  return handleResponse<ScoreResponse>(response);
}

/**
 * Process multiple scores in batch.
 */
export async function processScoresBatch(scoreIds: number[]): Promise<ProcessScoresBatchResponse> {
  const params = new URLSearchParams();
  scoreIds.forEach((id) => params.append("score_ids", id.toString()));

  const response = await fetch(`${API_BASE_URL}/api/v1/results/process/batch?${params.toString()}`, {
    method: "POST",
  });
  return handleResponse<ProcessScoresBatchResponse>(response);
}

/**
 * Process all scores for an exam.
 */
export async function processExamResults(
  examId: number,
  schoolId?: number,
  subjectId?: number
): Promise<ProcessExamResultsResponse> {
  const params = new URLSearchParams();
  if (schoolId) params.append("school_id", schoolId.toString());
  if (subjectId) params.append("subject_id", subjectId.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/results/process/exam/${examId}?${params.toString()}`,
    {
      method: "POST",
    }
  );
  return handleResponse<ProcessExamResultsResponse>(response);
}

/**
 * Process result for a specific subject registration.
 */
export async function processSubjectRegistrationResult(
  subjectRegistrationId: number
): Promise<ScoreResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/results/process/subject-registration/${subjectRegistrationId}`,
    {
      method: "POST",
    }
  );
  return handleResponse<ScoreResponse>(response);
}

/**
 * Process scores for selected exam subjects.
 */
export async function processExamSubjects(
  examSubjectIds: number[]
): Promise<ProcessExamResultsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/results/process/exam-subjects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        exam_subject_ids: examSubjectIds,
      }),
    }
  );
  return handleResponse<ProcessExamResultsResponse>(response);
}
