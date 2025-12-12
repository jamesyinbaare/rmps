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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
