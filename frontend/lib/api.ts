import type {
  Document,
  DocumentFilters,
  DocumentListResponse,
  BulkUploadResponse,
  Exam,
  ExamListResponse,
  School,
  Subject,
  ApiError,
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

export async function listExams(page = 1, pageSize = 100): Promise<ExamListResponse> {
  // Backend limits page_size to max 100, so cap it here
  const cappedPageSize = Math.min(pageSize, 100);
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", cappedPageSize.toString());

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

export async function listSubjects(page = 1, pageSize = 100): Promise<Subject[]> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/subjects?${params.toString()}`);
  return handleResponse<Subject[]>(response);
}

/**
 * Get exams that have at least one document
 */
export async function getExamsWithDocuments(): Promise<Exam[]> {
  const examsMap = new Map<number, Exam>();
  let page = 1;
  let hasMore = true;

  // Fetch all exams
  while (hasMore) {
    const examsData = await listExams(page, 100);
    examsData.items.forEach((exam) => {
      examsMap.set(exam.id, exam);
    });
    hasMore = page < examsData.total_pages;
    page++;
  }

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

  // Return only exams that have documents
  return Array.from(examIdsWithDocs)
    .map((examId) => examsMap.get(examId))
    .filter((exam): exam is Exam => exam !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
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
