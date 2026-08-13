import type {
  Document,
  DocumentFilters,
  DocumentListResponse,
  BulkUploadResponse,
  UploadInitiateFile,
  UploadInitiateResponse,
  UploadConfirmResponse,
  Exam,
  ExamListResponse,
  ExamProgressResponse,
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
  CandidateBulkUploadJobCreateResponse,
  CandidateBulkUploadJobStatusResponse,
  SchoolCandidateExamMapResponse,
  SubjectRequirementsValidationMode,
  CandidateListResponse,
  CandidatePhoto,
  CandidatePhotoListResponse,
  PhotoAlbumResponse,
  PhotoAlbumFilters,
  PhotoBulkUploadResponse,
  SubjectBulkUploadResponse,
  SchoolBulkUploadResponse,
  ExamRegistration,
  SubjectRegistration,
  ScoreDocumentFilters,
  ScoresExtractionStatusCounts,
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
  MyValidationStats,
  ClerkValidationStatsResponse,
  IssueBatchListResponse,
  ClerkBatchListResponse,
  MyBatchesFilters,
  CreateBatchesRequest,
  CreateBatchesResponse,
  ClearBatchesRequest,
  ClearBatchesResponse,
  BatchSummaryResponse,
  ClerkListResponse,
  User,
  UserUpdate,
  UserPasswordReset,
  UserListFilters,
  BackfillTestTypeResponse,
  SheetIdComparisonResponse,
  ExamSchoolListResponse,
  ExamResultsSummary,
  SchoolResultsSummary,
  ExamProgrammeSummary,
  SchoolResultsListResponse,
  IssueFormCandidatesResponse,
  ExamRegistrationResultDetail,
  CertificateTemplate,
  CertificateTemplateListResponse,
  CertificateFieldCatalogResponse,
  CertificateIssuance,
  CertificateIssuanceLedgerResponse,
  CertificateBatchJob,
  CertificateBatchJobListResponse,
  CertificateLayoutJson,
  CertificateTemplateAsset,
  CertificateTemplateAssetListResponse,
  CertificateScan,
  CertificateScanBatch,
  CertificateScanListResponse,
} from "@/types/document";

/**
 * Resolve the public/internal API base URL.
 * - NEXT_PUBLIC_API_BASE_URL wins when set (build-time or runtime).
 * - In the browser, derive `sems-api.<parent>` from the current host (exam-tools pattern).
 * - On the server, prefer INTERNAL_API_BASE_URL (compose service name).
 */
export function getApiBaseUrl(): string {
  const envBase =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_BASE_URL?.trim() : undefined;
  if (envBase) return envBase.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:8000";

    const parts = hostname.split(".");
    if (parts.length >= 3) {
      const [subdomain, ...rest] = parts;
      const apiSubdomain = subdomain.endsWith("-api") ? subdomain : `${subdomain}-api`;
      return `${protocol}//${apiSubdomain}.${rest.join(".")}`;
    }

    return `${protocol}//${hostname}`;
  }

  const internal =
    typeof process !== "undefined" ? process.env.INTERNAL_API_BASE_URL?.trim() : undefined;
  if (internal) return internal.replace(/\/$/, "");

  return "http://localhost:8000";
}

/** Lazily resolves so browser hostname derivation and SSR INTERNAL_API_BASE_URL both work. */
export const API_BASE_URL = {
  toString() {
    return getApiBaseUrl();
  },
  valueOf() {
    return getApiBaseUrl();
  },
  [Symbol.toPrimitive]() {
    return getApiBaseUrl();
  },
} as unknown as string;

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

/**
 * Get refresh token from localStorage
 */
function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

/**
 * Set both access and refresh tokens in localStorage
 */
function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("auth_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
}

/**
 * Clear both tokens from localStorage
 */
function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
}

/**
 * Create headers with authentication token if available
 */
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch with automatic token refresh on 401 errors.
 * This wrapper handles token refresh and retries the request automatically.
 */
async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> {
  const maxRetries = 1; // Only retry once after token refresh

  // Add auth headers
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If 401 and we have a refresh token, try to refresh
  if (response.status === 401 && retryCount < maxRetries) {
    const refreshToken = getRefreshToken();

    if (refreshToken && !isRefreshing) {
      try {
        isRefreshing = true;

        if (!refreshPromise) {
          refreshPromise = refreshAccessToken();
        }

        await refreshPromise;

        isRefreshing = false;
        refreshPromise = null;

        // Retry the original request with new token
        return fetchWithAuth(url, options, retryCount + 1);
      } catch (error) {
        // Refresh failed
        isRefreshing = false;
        refreshPromise = null;
        clearTokens();

        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login?expired=true";
        }
      }
    } else if (!refreshToken) {
      // No refresh token - clear and redirect
      clearTokens();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login?expired=true";
      }
    }
  }

  return response;
}

// Track if we're currently refreshing to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<TokenResponse> | null = null;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // Try to refresh token if we have a refresh token
      const refreshToken = getRefreshToken();

      if (refreshToken && !isRefreshing) {
        try {
          // Start refresh process
          isRefreshing = true;

          // Use existing refresh promise if one is in progress
          if (!refreshPromise) {
            refreshPromise = refreshAccessToken();
          }

          await refreshPromise;

          // Reset refresh state
          isRefreshing = false;
          refreshPromise = null;

          // Note: We can't automatically retry from here, but tokens are updated
          // The caller should retry the request, or use fetchWithAuth for automatic retry
        } catch (error) {
          // Refresh failed - clear tokens and redirect to login
          isRefreshing = false;
          refreshPromise = null;
          clearTokens();

          if (typeof window !== "undefined") {
            // Only redirect if not already on login page
            if (window.location.pathname !== "/login") {
              window.location.href = "/login?expired=true";
            }
          }
        }
      } else if (!refreshToken) {
        // No refresh token - clear tokens and redirect
        clearTokens();

        if (typeof window !== "undefined") {
          // Only redirect if not already on login page
          if (window.location.pathname !== "/login") {
            window.location.href = "/login?expired=true";
          }
        }
      }
    }

    let errorDetail = `HTTP error! status: ${response.status}`;
    try {
      const contentType = response.headers.get("content-type");
      const text = await response.text();

      if (contentType && contentType.includes("application/json") && text) {
        try {
          const error: ApiError = JSON.parse(text);
          // FastAPI returns errors with a "detail" field
          // Handle case where detail might be an object (validation errors)
          if (error.detail) {
            if (typeof error.detail === "string") {
              errorDetail = error.detail;
            } else if (typeof error.detail === "object") {
              // For validation errors, detail is an array of objects
              // Format them nicely
              if (Array.isArray(error.detail)) {
                errorDetail = error.detail
                  .map((item: any) => {
                    if (typeof item === "object" && item.msg && item.loc) {
                      return `${item.loc.join(".")}: ${item.msg}`;
                    }
                    return JSON.stringify(item);
                  })
                  .join(", ");
              } else {
                errorDetail = JSON.stringify(error.detail);
              }
            } else {
              errorDetail = String(error.detail);
            }
          } else {
            errorDetail = text;
          }
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

    // For 401 errors, throw a specific error that won't show the generic error message
    if (response.status === 401) {
      throw new Error("Session expired. Please log in again.");
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
  if (filters.id_extraction_error_code) {
    params.append("id_extraction_error_code", filters.id_extraction_error_code);
  }
  if (filters.q) params.append("q", filters.q);
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

export async function initiateDocumentUploads(
  examId: number,
  files: UploadInitiateFile[]
): Promise<UploadInitiateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/uploads/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam_id: examId, files }),
  });
  return handleResponse<UploadInitiateResponse>(response);
}

export async function confirmDocumentUploads(
  documentIds: number[]
): Promise<UploadConfirmResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/uploads/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  return handleResponse<UploadConfirmResponse>(response);
}

/** Resolve relative local content URLs against the API base. */
export function resolveUploadUrl(uploadUrl: string): string {
  if (uploadUrl.startsWith("http://") || uploadUrl.startsWith("https://")) {
    return uploadUrl;
  }
  const base = getApiBaseUrl().replace(/\/$/, "");
  return `${base}${uploadUrl.startsWith("/") ? "" : "/"}${uploadUrl}`;
}

export async function putFileToUploadUrl(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>
): Promise<void> {
  const url = resolveUploadUrl(uploadUrl);
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: file,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Upload PUT failed with status ${response.status}`);
  }
}

export async function getDocument(documentId: number): Promise<Document> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`);
  return handleResponse<Document>(response);
}

/** Absolute download URL for a document file. */
export function getDocumentDownloadUrl(documentId: number): string {
  return `${getApiBaseUrl()}/api/v1/documents/${documentId}/download`;
}

/** Preferred filename for saving a downloaded document. */
export function getDocumentDownloadFilename(doc: {
  file_name: string;
  extracted_id?: string | null;
}): string {
  if (doc.extracted_id) {
    const fileExtension = doc.file_name.split(".").pop();
    return fileExtension ? `${doc.extracted_id}.${fileExtension}` : doc.extracted_id;
  }
  return doc.file_name;
}

function triggerAnchorDownload(url: string, filename?: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Download a document file via navigation (no CORS).
 * Backend Content-Disposition: attachment drives the save dialog.
 * Avoids fetch() which can fail as TypeError: Failed to fetch across localhost origins.
 */
export async function downloadDocument(
  documentId: number,
  filename?: string
): Promise<void> {
  triggerAnchorDownload(getDocumentDownloadUrl(documentId), filename);
}

export async function deleteDocument(documentId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(typeof error.detail === "string" ? error.detail : `HTTP error! status: ${response.status}`);
  }
}

export async function bulkDeleteDocuments(
  documentIds: number[]
): Promise<{ deleted: number; failed: number; errors: Array<{ document_id: string; error: string }> }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  return handleResponse(response);
}

export async function extractDocumentId(documentId: number): Promise<{
  extracted_id: string | null;
  is_valid: boolean;
  error_code?: string | null;
  error_message?: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/extract-id`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function bulkExtractDocumentIds(
  documentIds: number[]
): Promise<{ queued: number; document_ids: number[] }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/bulk-extract-id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  return handleResponse(response);
}

export function getDocumentThumbnailUrl(documentId: number, size = 320): string {
  return `${API_BASE_URL}/api/v1/documents/${documentId}/thumbnail?size=${size}`;
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

export async function backfillFromExtractedId(
  dryRun: boolean = false
): Promise<BackfillTestTypeResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/documents/admin/backfill-from-extracted-id?dry_run=${dryRun}`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse<BackfillTestTypeResponse>(response);
}

export async function listExams(
  examType?: string | null,
  series?: string | null,
  year?: number | null,
  page = 1,
  pageSize = 100
): Promise<ExamListResponse> {
  const cappedPageSize = Math.min(pageSize, 200);
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", cappedPageSize.toString());
  if (examType) params.append("exam_type", examType);
  if (series) params.append("series", series);
  if (year != null) params.append("year", year.toString());

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

const ALL_EXAMS_CACHE_TTL_MS = 5 * 60 * 1000;
let allExamsCache: { expiresAt: number; promise: Promise<Exam[]> } | null = null;

/**
 * Get all exams via a single paginated list (filters optional on the API).
 * Results are cached in-memory for 5 minutes to avoid refetch storms across pages.
 */
export async function getAllExams(): Promise<Exam[]> {
  const now = Date.now();
  if (allExamsCache && allExamsCache.expiresAt > now) {
    return allExamsCache.promise;
  }

  const promise = (async () => {
    const allExamsList: Exam[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await listExams(null, null, null, page, 200);
      allExamsList.push(...response.items);
      hasMore = page < response.total_pages;
      page++;
    }
    return allExamsList;
  })();

  allExamsCache = {
    expiresAt: now + ALL_EXAMS_CACHE_TTL_MS,
    promise,
  };

  try {
    return await promise;
  } catch (err) {
    allExamsCache = null;
    throw err;
  }
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
 * Get exams that have at least one document (via facet API).
 */
export async function getExamsWithDocuments(): Promise<Exam[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/facets/exams`);
  const facets = await handleResponse<
    Array<{
      id: number;
      exam_type: string;
      series: string;
      year: number;
      description: string | null;
      document_count: number;
    }>
  >(response);
  return facets.map((f) => ({
    id: f.id,
    exam_type: f.exam_type,
    series: f.series,
    year: f.year,
    description: f.description,
    number_of_series: 1,
    subjects_to_serialize: null,
    created_at: "",
    updated_at: "",
  })) as Exam[];
}

/**
 * Get schools for an exam that have documents (via facet API).
 */
export async function getSchoolsForExam(examId: number): Promise<School[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/documents/facets/schools?exam_id=${examId}`
  );
  const facets = await handleResponse<
    Array<{ id: number; name: string; code: string; document_count: number }>
  >(response);
  return facets.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    s_code: f.code,
    region: "Greater Accra Region",
    zone: "A",
    school_type: null,
    created_at: "",
    updated_at: "",
  })) as School[];
}

/**
 * Get subjects for an exam and school combination that have documents (via facet API).
 */
export async function getSubjectsForExamAndSchool(
  examId: number,
  schoolId: number
): Promise<Subject[]> {
  const params = new URLSearchParams({
    exam_id: String(examId),
    school_id: String(schoolId),
  });
  const response = await fetch(
    `${API_BASE_URL}/api/v1/documents/facets/subjects?${params.toString()}`
  );
  const facets = await handleResponse<
    Array<{ id: number; name: string; code: string; document_count: number }>
  >(response);
  return facets.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    original_code: f.code,
    subject_type: "CORE",
    exam_type: "Certificate II Examinations",
    created_at: "",
    updated_at: "",
  })) as Subject[];
}

/**
 * Compare expected sheet IDs (from score sheet generation) with uploaded document IDs
 */
export async function compareSheetIds(
  examId: number,
  filters?: {
    school_id?: number;
    subject_id?: number;
    test_type?: number;
  }
): Promise<SheetIdComparisonResponse> {
  const params = new URLSearchParams();
  if (filters?.school_id !== undefined) {
    params.append("school_id", filters.school_id.toString());
  }
  if (filters?.subject_id !== undefined) {
    params.append("subject_id", filters.subject_id.toString());
  }
  if (filters?.test_type !== undefined) {
    params.append("test_type", filters.test_type.toString());
  }

  const url = `${API_BASE_URL}/api/v1/exams/${examId}/sheet-ids/compare${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  return handleResponse<SheetIdComparisonResponse>(response);
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

export async function startCandidatesBulkUpload(
  file: File,
  examId: number,
  subjectRequirementsValidation: SubjectRequirementsValidationMode = "auto"
): Promise<CandidateBulkUploadJobCreateResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_id", examId.toString());
  formData.append("subject_requirements_validation", subjectRequirementsValidation);

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<CandidateBulkUploadJobCreateResponse>(response);
}

export async function getCandidatesBulkUploadJob(
  jobId: number
): Promise<CandidateBulkUploadJobStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/bulk-upload/${jobId}`);
  return handleResponse<CandidateBulkUploadJobStatusResponse>(response);
}

/**
 * Start a candidate bulk upload and poll until the background job finishes.
 * Optionally report intermediate progress via onProgress.
 */
export async function uploadCandidatesBulk(
  file: File,
  examId: number,
  subjectRequirementsValidation: SubjectRequirementsValidationMode = "auto",
  onProgress?: (status: CandidateBulkUploadJobStatusResponse) => void
): Promise<CandidateBulkUploadResponse> {
  const job = await startCandidatesBulkUpload(file, examId, subjectRequirementsValidation);
  const terminal = new Set(["completed", "failed"]);
  const pollMs = 1500;

  // Immediate first poll
  let status = await getCandidatesBulkUploadJob(job.job_id);
  onProgress?.(status);

  while (!terminal.has(status.status)) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    status = await getCandidatesBulkUploadJob(job.job_id);
    onProgress?.(status);
  }

  if (status.status === "failed" && status.error_message && status.successful === 0) {
    throw new Error(status.error_message);
  }

  return {
    total_rows: status.total_rows,
    successful: status.successful,
    failed: status.failed,
    errors: status.errors,
  };
}

// Candidate Photo API Functions

export async function uploadCandidatePhoto(
  candidateId: number,
  file: File,
  isActive: boolean = true
): Promise<CandidatePhoto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("is_active", isActive.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/photos`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<CandidatePhoto>(response);
}

export async function getCandidatePhotos(
  candidateId: number,
  page: number = 1,
  pageSize: number = 20
): Promise<CandidatePhotoListResponse> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/candidates/${candidateId}/photos?${params.toString()}`
  );
  return handleResponse<CandidatePhotoListResponse>(response);
}

export async function getActiveCandidatePhoto(candidateId: number): Promise<CandidatePhoto | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/photos/active`);
  if (response.status === 204 || response.status === 404) {
    return null;
  }
  return handleResponse<CandidatePhoto>(response);
}

export async function getCandidatePhoto(candidateId: number, photoId: number): Promise<CandidatePhoto> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/photos/${photoId}`);
  return handleResponse<CandidatePhoto>(response);
}

export async function deleteCandidatePhoto(candidateId: number, photoId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/photos/${photoId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

export async function activateCandidatePhoto(candidateId: number, photoId: number): Promise<CandidatePhoto> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/candidates/${candidateId}/photos/${photoId}/activate`,
    {
      method: "PUT",
    }
  );
  return handleResponse<CandidatePhoto>(response);
}

export async function getPhotoFile(candidateId: number, photoId: number): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/${candidateId}/photos/${photoId}/file`);
  if (response.status === 404) {
    // File not found - this is expected when the file doesn't exist in storage
    return null;
  }
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function bulkUploadPhotos(
  examId: number,
  files: File[]
): Promise<PhotoBulkUploadResponse> {
  const formData = new FormData();
  formData.append("exam_id", examId.toString());
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/photos/bulk-upload`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<PhotoBulkUploadResponse>(response);
}

export async function getPhotoAlbum(filters: PhotoAlbumFilters = {}): Promise<PhotoAlbumResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.programme_id) params.append("programme_id", filters.programme_id.toString());
  if (filters.has_photo !== undefined) params.append("has_photo", filters.has_photo.toString());
  if (filters.search_query?.trim()) params.append("search_query", filters.search_query.trim());

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/photos/album?${params.toString()}`);
  return handleResponse<PhotoAlbumResponse>(response);
}

export async function generatePhotoAlbumPdf(
  examId: number,
  schoolId: number,
  programmeId?: number,
  hasPhoto?: boolean,
  searchQuery?: string,
  columns?: number,
  rowsPerColumn?: number
): Promise<Blob> {
  const params = new URLSearchParams();
  params.append("exam_id", examId.toString());
  params.append("school_id", schoolId.toString());
  if (programmeId) params.append("programme_id", programmeId.toString());
  if (hasPhoto !== undefined) params.append("has_photo", hasPhoto.toString());
  if (searchQuery && searchQuery.trim()) params.append("search_query", searchQuery.trim());
  if (columns !== undefined) params.append("columns", columns.toString());
  if (rowsPerColumn !== undefined) params.append("rows_per_column", rowsPerColumn.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/candidates/photos/album/pdf?${params.toString()}`);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
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

/** One-shot map of candidate_id -> exam_ids for every candidate at a school. */
export async function getSchoolCandidateExamMap(
  schoolId: number
): Promise<SchoolCandidateExamMapResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/schools/${schoolId}/candidate-exam-map`
  );
  return handleResponse<SchoolCandidateExamMapResponse>(response);
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

/**
 * Get comprehensive progress data for an exam.
 */
export async function getExamProgress(
  examId: number,
  options?: { signal?: AbortSignal }
): Promise<ExamProgressResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/progress`, {
    signal: options?.signal,
  });
  return handleResponse<ExamProgressResponse>(response);
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
    subjects_to_serialize?: string[] | null;
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

export interface GradeRangeConfig {
  grade: string;
  min: number | null;
  max: number | null;
}

export interface ExamSubject {
  id: number;
  exam_id: number;
  subject_id: number;
  subject_code: string;
  original_code: string;
  subject_name: string;
  subject_type: "CORE" | "ELECTIVE";
  obj_pct: number | null;
  essay_pct: number | null;
  pract_pct: number | null;
  obj_max_score: number | null;
  essay_max_score: number | null;
  pract_max_score: number | null;
  grade_ranges_json?: GradeRangeConfig[] | null;
  created_at: string;
  updated_at: string;
}

export async function listExamSubjects(examId: number): Promise<ExamSubject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/subjects`);
  return handleResponse<ExamSubject[]>(response);
}

export async function getGradeRanges(examSubjectId: number): Promise<{ exam_subject_id: number; grade_ranges: GradeRangeConfig[] | null }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exam-subjects/${examSubjectId}/grade-ranges`);
  return handleResponse<{ exam_subject_id: number; grade_ranges: GradeRangeConfig[] | null }>(response);
}

export async function upsertGradeRanges(examSubjectId: number, gradeRanges: GradeRangeConfig[]): Promise<{ exam_subject_id: number; grade_ranges: GradeRangeConfig[] | null }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exam-subjects/${examSubjectId}/grade-ranges`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grade_ranges: gradeRanges }),
  });
  return handleResponse<{ exam_subject_id: number; grade_ranges: GradeRangeConfig[] | null }>(response);
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

export interface SerializationJobCreateResponse {
  job_id: number;
  status: string;
  total_schools: number;
  exam_id: number;
}

export interface SerializationJobStatusResponse {
  job_id: number;
  exam_id: number;
  status: string;
  total_schools: number;
  processed_schools: number;
  school_id: number | null;
  total_candidates_count: number;
  total_schools_count: number;
  subjects_serialized_count: number;
  subjects_defaulted_count: number;
  schools_processed: SerializationResponse["schools_processed"];
  subjects_processed: SerializationResponse["subjects_processed"];
  subjects_defaulted: SerializationResponse["subjects_defaulted"];
  message: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export async function startSerializeExam(
  examId: number,
  subjectCodes?: string[],
  schoolId?: number | null
): Promise<SerializationJobCreateResponse> {
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
  return handleResponse<SerializationJobCreateResponse>(response);
}

export async function getSerializeExamJob(
  examId: number,
  jobId: number
): Promise<SerializationJobStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/serialize/${jobId}`);
  return handleResponse<SerializationJobStatusResponse>(response);
}

/**
 * Start exam serialization and poll until the background job finishes.
 */
export async function serializeExam(
  examId: number,
  subjectCodes?: string[],
  schoolId?: number | null,
  onProgress?: (status: SerializationJobStatusResponse) => void
): Promise<SerializationResponse> {
  const job = await startSerializeExam(examId, subjectCodes, schoolId);
  const terminal = new Set(["completed", "failed"]);
  const pollMs = 1500;

  let status = await getSerializeExamJob(examId, job.job_id);
  onProgress?.(status);

  while (!terminal.has(status.status)) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    status = await getSerializeExamJob(examId, job.job_id);
    onProgress?.(status);
  }

  if (status.status === "failed") {
    throw new Error(status.error_message || status.message || "Serialization failed");
  }

  return {
    exam_id: status.exam_id,
    school_id: status.school_id,
    total_candidates_count: status.total_candidates_count,
    total_schools_count: status.total_schools_count,
    subjects_serialized_count: status.subjects_serialized_count,
    subjects_defaulted_count: status.subjects_defaulted_count,
    schools_processed: status.schools_processed,
    subjects_processed: status.subjects_processed,
    subjects_defaulted: status.subjects_defaulted,
    message: status.message || "Serialization complete",
  };
}

export interface ScoreSheetGenerationResponse {
  exam_id: number;
  total_sheets_generated: number;
  total_candidates_assigned: number;
  schools_processed: Array<{
    school_id: number;
    school_name: string;
    sheets_count: number;
    candidates_count: number;
  }>;
  subjects_processed: Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    sheets_count: number;
    candidates_count: number;
  }>;
  sheets_by_series: Record<number, number>;
  message: string;
}

export interface ScoreSheetGenerationJobCreateResponse {
  job_id: number;
  status: string;
  total_schools: number;
  exam_id: number;
}

export interface ScoreSheetGenerationJobStatusResponse {
  job_id: number;
  exam_id: number;
  status: string;
  total_schools: number;
  processed_schools: number;
  school_id: number | null;
  subject_id: number | null;
  test_types: number[];
  total_sheets_generated: number;
  total_candidates_assigned: number;
  schools_processed: ScoreSheetGenerationResponse["schools_processed"];
  subjects_processed: ScoreSheetGenerationResponse["subjects_processed"];
  sheets_by_series: Record<number, number>;
  message: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export async function startGenerateScoreSheets(
  examId: number,
  options?: {
    schoolId?: number | null;
    subjectId?: number | null;
    testTypes?: number[];
  }
): Promise<ScoreSheetGenerationJobCreateResponse> {
  const params = new URLSearchParams();
  if (options?.schoolId != null) {
    params.append("school_id", options.schoolId.toString());
  }
  if (options?.subjectId != null) {
    params.append("subject_id", options.subjectId.toString());
  }
  const testTypes = options?.testTypes?.length ? options.testTypes : [1, 2];
  testTypes.forEach((t) => params.append("test_types", t.toString()));

  const url = `${API_BASE_URL}/api/v1/exams/${examId}/generate-score-sheets?${params.toString()}`;
  const response = await fetch(url, { method: "POST" });
  return handleResponse<ScoreSheetGenerationJobCreateResponse>(response);
}

export async function getGenerateScoreSheetsJob(
  examId: number,
  jobId: number
): Promise<ScoreSheetGenerationJobStatusResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/exams/${examId}/generate-score-sheets/${jobId}`
  );
  return handleResponse<ScoreSheetGenerationJobStatusResponse>(response);
}

/**
 * Start score sheet ID generation and poll until the background job finishes.
 */
export async function generateScoreSheets(
  examId: number,
  options?: {
    schoolId?: number | null;
    subjectId?: number | null;
    testTypes?: number[];
  },
  onProgress?: (status: ScoreSheetGenerationJobStatusResponse) => void
): Promise<ScoreSheetGenerationResponse> {
  const job = await startGenerateScoreSheets(examId, options);
  const terminal = new Set(["completed", "failed"]);
  const pollMs = 1500;

  let status = await getGenerateScoreSheetsJob(examId, job.job_id);
  onProgress?.(status);

  while (!terminal.has(status.status)) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    status = await getGenerateScoreSheetsJob(examId, job.job_id);
    onProgress?.(status);
  }

  if (status.status === "failed") {
    throw new Error(status.error_message || status.message || "Score sheet generation failed");
  }

  return {
    exam_id: status.exam_id,
    total_sheets_generated: status.total_sheets_generated,
    total_candidates_assigned: status.total_candidates_assigned,
    schools_processed: status.schools_processed,
    subjects_processed: status.subjects_processed,
    sheets_by_series: status.sheets_by_series,
    message: status.message || "Score sheet generation complete",
  };
}

export async function exportScannablesCore(examId: number): Promise<void> {
  const url = `${API_BASE_URL}/api/v1/exams/${examId}/export/scannables/core`;
  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download export" }));
    throw new Error((error as { detail?: string }).detail || "Failed to download core subjects export");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `exam_${examId}_scannables_core.xlsx`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }

  // Download the file
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function exportScannablesElectives(examId: number): Promise<void> {
  const url = `${API_BASE_URL}/api/v1/exams/${examId}/export/scannables/electives`;
  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download export" }));
    throw new Error((error as { detail?: string }).detail || "Failed to download electives export");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `exam_${examId}_scannables_electives.xlsx`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }

  // Download the file
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
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
  if (filters.scores_applied !== undefined) {
    params.append("scores_applied", filters.scores_applied ? "true" : "false");
  }
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/scores/documents?${params.toString()}`
  );
  return handleResponse<DocumentListResponse>(response);
}

export async function getScoresExtractionStatusCounts(
  filters: Omit<ScoreDocumentFilters, "extraction_status" | "page" | "page_size"> = {}
): Promise<ScoresExtractionStatusCounts> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.series) params.append("series", filters.series);
  if (filters.year) params.append("year", filters.year.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.test_type) params.append("test_type", filters.test_type);
  if (filters.extraction_method) params.append("extraction_method", filters.extraction_method);
  if (filters.scores_applied !== undefined) {
    params.append("scores_applied", filters.scores_applied ? "true" : "false");
  }

  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/scores/documents/status-counts?${params.toString()}`
  );
  return handleResponse<ScoresExtractionStatusCounts>(response);
}

export async function getDocumentScores(
  documentId: string,
  examId: number
): Promise<DocumentScoresResponse> {
  const params = new URLSearchParams({ exam_id: String(examId) });
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/scores/documents/${documentId}/scores?${params.toString()}`
  );
  return handleResponse<DocumentScoresResponse>(response);
}

export async function updateScore(scoreId: number, data: ScoreUpdate): Promise<ScoreResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/scores/scores/${scoreId}`, {
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
  data: BatchScoreUpdate,
  examId: number
): Promise<BatchScoreUpdateResponse> {
  const params = new URLSearchParams({ exam_id: String(examId) });
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/scores/documents/${documentId}/scores/batch?${params.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );
  return handleResponse<BatchScoreUpdateResponse>(response);
}

// Reducto Queue API Functions

export async function queueReductoExtraction(
  documentIds: number[],
  requireExtractedId: boolean = true
): Promise<ReductoQueueResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/documents/queue-reducto-extraction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document_ids: documentIds,
      require_extracted_id: requireExtractedId,
    }),
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
  documentId: number,
  verify: boolean = true
): Promise<UpdateScoresFromReductoResponse> {
  // Always send an explicit boolean — API defaults to true when omitted, but we never omit.
  const verifyFlag = verify !== false;
  const response = await fetch(`${API_BASE_URL}/api/v1/scores/documents/${documentId}/update-from-reducto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ verify: verifyFlag }),
  });
  return handleResponse<UpdateScoresFromReductoResponse>(response);
}

export interface BulkUpdateScoresFromReductoResult {
  documents_processed: number;
  documents_succeeded: number;
  documents_failed: number;
  updated_count: number;
  unmatched_count: number;
  skipped_count: number;
  skipped_records: Array<{
    index_number: string | null;
    candidate_name: string | null;
    score: string | number | null;
    verify: string | number | null;
  }>;
  errors: Array<{ document_id: number; error: string }>;
}

export async function bulkUpdateScoresFromReducto(
  documentIds: number[],
  verify: boolean = true,
  onProgress?: (done: number, total: number) => void
): Promise<BulkUpdateScoresFromReductoResult> {
  const result: BulkUpdateScoresFromReductoResult = {
    documents_processed: 0,
    documents_succeeded: 0,
    documents_failed: 0,
    updated_count: 0,
    unmatched_count: 0,
    skipped_count: 0,
    skipped_records: [],
    errors: [],
  };

  for (let i = 0; i < documentIds.length; i++) {
    const documentId = documentIds[i];
    try {
      const response = await updateScoresFromReducto(documentId, verify);
      result.documents_succeeded += 1;
      result.updated_count += response.updated_count;
      result.unmatched_count += response.unmatched_count;
      result.skipped_count += response.skipped_count ?? 0;
      if (response.skipped_records?.length) {
        result.skipped_records.push(...response.skipped_records);
      }
    } catch (err) {
      result.documents_failed += 1;
      result.errors.push({
        document_id: documentId,
        error: err instanceof Error ? err.message : "Failed to apply scores",
      });
    }
    result.documents_processed += 1;
    onProgress?.(result.documents_processed, documentIds.length);
  }

  return result;
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
  if (filters.subject_type) params.append("subject_type", filters.subject_type);
  if (filters.document_id) params.append("document_id", filters.document_id);
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/scores/candidates?${params.toString()}`);
  return handleResponse<CandidateScoreListResponse>(response);
}

export async function exportCandidateResults(
  filters: ManualEntryFilters,
  fields: string[],
  subjectType?: "CORE" | "ELECTIVE",
  exportFormat?: "standard" | "multi_subject",
  testType?: "obj" | "essay",
  subjectIds?: number[]
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", filters.exam_id.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.series) params.append("series", filters.series);
  if (filters.year) params.append("year", filters.year.toString());
  if (filters.school_id) params.append("school_id", filters.school_id.toString());
  if (filters.programme_id) params.append("programme_id", filters.programme_id.toString());
  if (filters.subject_id) params.append("subject_id", filters.subject_id.toString());
  if (filters.document_id) params.append("document_id", filters.document_id);

  // Add fields parameter
  params.append("fields", fields.join(","));
  // Add subject type parameter if provided
  if (subjectType) {
    params.append("subject_type", subjectType);
  }
  // Add export format parameter
  if (exportFormat) {
    params.append("export_format", exportFormat);
  }
  // Add test type parameter for multi-subject format
  if (testType) {
    params.append("test_type", testType);
  }
  // Add subject IDs parameter for multi-subject format
  if (subjectIds && subjectIds.length > 0) {
    params.append("subject_ids", subjectIds.join(","));
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/scores/export?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to export results" }));
    throw new Error(error.detail || "Failed to export results");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = "candidate_results_export.xlsx";
  if (contentDisposition) {
    // Try to extract filename from Content-Disposition header
    // Handle formats: filename="value", filename=value, filename*=UTF-8''value
    // Pattern 1: filename="value" (with quotes)
    let filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1];
    } else {
      // Pattern 2: filename=value (without quotes)
      filenameMatch = contentDisposition.match(/filename=([^;]+)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].trim();
      } else {
        // Pattern 3: RFC 5987 format: filename*=UTF-8''value
        filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
    }
  }

  // Create blob and download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
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
  testTypes?: number[],
  template?: "new" | "old"
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
  if (template) {
    params.append("template", template);
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
  testTypes?: number[],
  template?: "new" | "old"
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
  if (template) {
    params.append("template", template);
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
  pdf_file_paths: string[] | null;
  error: string | null;
}

export interface PdfGenerationJob {
  id: number;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  exam_id: number;
  school_ids: number[] | null;
  subject_ids: number[] | null;
  subject_id: number | null;
  test_types: number[];
  template?: "new" | "old";
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
  subject_ids?: number[] | null;
  subject_id?: number | null;
  test_types?: number[];
  template?: "new" | "old";
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
 * @param jobId - The job ID
 * @param mergePerSchool - If true, merge PDFs per school into a single PDF per school
 */
export async function downloadJobAllPdfs(jobId: number, mergePerSchool: boolean = false): Promise<Blob> {
  const params = new URLSearchParams();
  if (mergePerSchool) {
    params.append("merge_per_school", "true");
  }
  const url = `${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}/download-all${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.blob();
}

/**
 * Merge existing annotated PDFs for a specific school from a job into a single PDF.
 */
export async function mergeJobSchoolPdf(jobId: number, schoolId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pdf-generation-jobs/${jobId}/merge/${schoolId}`);
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
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/run`, {
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
  if (filters.subject_type) params.append("subject_type", filters.subject_type);
  if (filters.batch_id) params.append("batch_id", filters.batch_id.toString());
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());

  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/issues?${params.toString()}`
  );
  return handleResponse<ValidationIssueListResponse>(response);
}

export async function getValidationIssue(issueId: number): Promise<ValidationIssueDetailResponse> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/issues/${issueId}`
  );
  return handleResponse<ValidationIssueDetailResponse>(response);
}

export async function resolveValidationIssue(
  issueId: number,
  correctedScore: string
): Promise<SubjectScoreValidationIssue> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/issues/${issueId}/resolve`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        corrected_score: correctedScore,
      }),
    }
  );
  return handleResponse<SubjectScoreValidationIssue>(response);
}

export async function ignoreValidationIssue(issueId: number): Promise<SubjectScoreValidationIssue> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/issues/${issueId}/ignore`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<SubjectScoreValidationIssue>(response);
}

export async function getMyValidationStats(): Promise<MyValidationStats> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/stats/me`);
  return handleResponse<MyValidationStats>(response);
}

export async function getClerkValidationStats(
  examId?: number
): Promise<ClerkValidationStatsResponse> {
  const params = new URLSearchParams();
  if (examId) params.append("exam_id", String(examId));
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/stats/clerks${qs ? `?${qs}` : ""}`
  );
  return handleResponse<ClerkValidationStatsResponse>(response);
}

export async function createIssueBatches(
  request: CreateBatchesRequest
): Promise<CreateBatchesResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleResponse<CreateBatchesResponse>(response);
}

export async function clearIssueBatches(
  request: ClearBatchesRequest
): Promise<ClearBatchesResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/batches/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleResponse<ClearBatchesResponse>(response);
}

export async function listMyBatches(
  filters: MyBatchesFilters = {}
): Promise<ClerkBatchListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.exam_id) params.append("exam_id", String(filters.exam_id));
  if (filters.subject_id) params.append("subject_id", String(filters.subject_id));
  if (filters.test_type) params.append("test_type", String(filters.test_type));
  if (filters.has_document !== undefined) {
    params.append("has_document", String(filters.has_document));
  }
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/batches/mine?${params.toString()}`
  );
  return handleResponse<ClerkBatchListResponse>(response);
}

export async function listIssueBatches(filters: {
  exam_id?: number;
  subject_id?: number;
  test_type?: number;
  has_document?: boolean;
  unassigned_only?: boolean;
  assigned_to?: string;
} = {}): Promise<IssueBatchListResponse> {
  const params = new URLSearchParams();
  if (filters.exam_id) params.append("exam_id", String(filters.exam_id));
  if (filters.subject_id) params.append("subject_id", String(filters.subject_id));
  if (filters.test_type) params.append("test_type", String(filters.test_type));
  if (filters.has_document !== undefined) {
    params.append("has_document", String(filters.has_document));
  }
  if (filters.unassigned_only) params.append("unassigned_only", "true");
  if (filters.assigned_to) params.append("assigned_to", filters.assigned_to);
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/batches?${params.toString()}`
  );
  return handleResponse<IssueBatchListResponse>(response);
}

export async function assignIssueBatches(
  batchIds: number[],
  userId: string
): Promise<{ assigned_count: number; batch_ids: number[] }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/batches/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch_ids: batchIds, user_id: userId }),
  });
  return handleResponse(response);
}

export async function releaseIssueBatches(payload: {
  batch_ids?: number[];
  user_id?: string;
}): Promise<{ released_count: number }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/batches/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function getBatchSummary(examId?: number): Promise<BatchSummaryResponse> {
  const params = new URLSearchParams();
  if (examId) params.append("exam_id", String(examId));
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/validation/batches/summary?${params.toString()}`
  );
  return handleResponse<BatchSummaryResponse>(response);
}

export async function listClerks(): Promise<ClerkListResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/validation/clerks`);
  return handleResponse<ClerkListResponse>(response);
}

export async function getClerkDigitalEntrySetting(): Promise<{ enabled: boolean }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/settings/clerk-digital-entry`);
  return handleResponse<{ enabled: boolean }>(response);
}

export async function setClerkDigitalEntrySetting(
  enabled: boolean
): Promise<{ enabled: boolean }> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/settings/clerk-digital-entry`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return handleResponse<{ enabled: boolean }>(response);
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

// Certificates / Results browser API

export async function getExamResultsSummary(
  examId: number
): Promise<ExamResultsSummary> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/summary`
  );
  return handleResponse<ExamResultsSummary>(response);
}

export async function getSchoolResultsSummary(
  examId: number,
  schoolId: number
): Promise<SchoolResultsSummary> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/schools/${schoolId}/summary`
  );
  return handleResponse<SchoolResultsSummary>(response);
}

export async function listExamResultSchools(
  examId: number,
  options: {
    page?: number;
    page_size?: number;
    search?: string;
    include_counts?: boolean;
    include_fully_graded?: boolean;
  } = {}
): Promise<ExamSchoolListResponse> {
  const params = new URLSearchParams();
  if (options.page) params.append("page", options.page.toString());
  if (options.page_size) params.append("page_size", options.page_size.toString());
  if (options.search) params.append("search", options.search);
  if (options.include_counts === false) params.append("include_counts", "false");
  if (options.include_fully_graded === false) params.append("include_fully_graded", "false");
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/schools${qs ? `?${qs}` : ""}`
  );
  return handleResponse<ExamSchoolListResponse>(response);
}

export async function listExamSchoolProgrammes(
  examId: number,
  schoolId: number
): Promise<ExamProgrammeSummary[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/schools/${schoolId}/programmes`
  );
  return handleResponse<ExamProgrammeSummary[]>(response);
}

export async function listSchoolResults(
  examId: number,
  schoolId: number,
  options: {
    programme_id?: number;
    search?: string;
    status?: string;
    page?: number;
    page_size?: number;
  } = {}
): Promise<SchoolResultsListResponse> {
  const params = new URLSearchParams();
  if (options.programme_id) params.append("programme_id", options.programme_id.toString());
  if (options.search) params.append("search", options.search);
  if (options.status) params.append("status", options.status);
  if (options.page) params.append("page", options.page.toString());
  if (options.page_size) params.append("page_size", options.page_size.toString());
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/schools/${schoolId}/results${qs ? `?${qs}` : ""}`
  );
  return handleResponse<SchoolResultsListResponse>(response);
}

export async function getExamRegistrationResultDetail(
  registrationId: number
): Promise<ExamRegistrationResultDetail> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exam-registrations/${registrationId}/result-detail`
  );
  return handleResponse<ExamRegistrationResultDetail>(response);
}

export async function listCertificateTemplates(
  options: { examId?: number; activeOnly?: boolean } = {}
): Promise<CertificateTemplateListResponse> {
  const params = new URLSearchParams();
  params.append("active_only", String(options.activeOnly ?? true));
  if (options.examId != null) params.append("exam_id", String(options.examId));
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates?${params.toString()}`
  );
  return handleResponse<CertificateTemplateListResponse>(response);
}

export async function getCertificateFieldCatalog(): Promise<CertificateFieldCatalogResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/certificates/field-catalog`);
  return handleResponse<CertificateFieldCatalogResponse>(response);
}

export async function getCertificateTemplate(templateId: number): Promise<CertificateTemplate> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}`
  );
  return handleResponse<CertificateTemplate>(response);
}

export async function getDefaultCertificateLayout(): Promise<CertificateLayoutJson> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/default-layout`
  );
  return handleResponse<CertificateLayoutJson>(response);
}

export async function createCertificateTemplate(body: {
  name: string;
  exam_id: number;
  page_width_mm?: number;
  page_height_mm?: number;
  layout_json?: CertificateLayoutJson;
  is_active?: boolean;
}): Promise<CertificateTemplate> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/certificates/templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return handleResponse<CertificateTemplate>(response);
}

export async function updateCertificateTemplate(
  templateId: number,
  body: Partial<{
    name: string;
    exam_id: number;
    page_width_mm: number;
    page_height_mm: number;
    layout_json: CertificateLayoutJson;
    is_active: boolean;
  }>
): Promise<CertificateTemplate> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
  return handleResponse<CertificateTemplate>(response);
}

export async function deactivateCertificateTemplate(templateId: number): Promise<void> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function previewCertificatePdf(
  registrationId: number,
  options: {
    templateId?: number;
    issuanceDate?: string;
    certificateNumber?: string;
  } = {}
): Promise<Blob> {
  const params = new URLSearchParams();
  if (options.templateId) params.append("template_id", options.templateId.toString());
  if (options.issuanceDate) params.append("issuance_date", options.issuanceDate);
  if (options.certificateNumber?.trim()) {
    params.append("certificate_number", options.certificateNumber.trim());
  }
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exam-registrations/${registrationId}/certificate/preview${qs ? `?${qs}` : ""}`
  );
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function generateCertificatePdf(
  registrationId: number,
  options: {
    templateId?: number;
    reissue?: boolean;
    voidReason?: string;
    issuanceDate?: string;
    certificateNumber?: string;
  } = {}
): Promise<{ blob: Blob; certificateNumber: string | null; issuanceId: string | null }> {
  const params = new URLSearchParams();
  params.append("download", "true");
  if (options.templateId) params.append("template_id", options.templateId.toString());
  if (options.reissue) params.append("reissue", "true");
  if (options.voidReason) params.append("void_reason", options.voidReason);
  if (options.issuanceDate) params.append("issuance_date", options.issuanceDate);
  if (options.certificateNumber?.trim()) {
    params.append("certificate_number", options.certificateNumber.trim());
  }
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exam-registrations/${registrationId}/certificate/generate?${params.toString()}`,
    { method: "POST" }
  );
  if (!response.ok) {
    await handleResponse(response);
  }
  return {
    blob: await response.blob(),
    certificateNumber: response.headers.get("X-Certificate-Number"),
    issuanceId: response.headers.get("X-Certificate-Issuance-Id"),
  };
}

export async function getRegistrationCertificateIssuance(
  registrationId: number
): Promise<CertificateIssuance | null> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exam-registrations/${registrationId}/certificate/issuance`
  );
  if (response.status === 204) return null;
  const data = await handleResponse<CertificateIssuance | null>(response);
  return data;
}

export async function markCertificatePrinted(
  issuanceId: number,
  printed = true
): Promise<CertificateIssuance> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances/${issuanceId}/mark-printed`,
    {
      method: "POST",
      body: JSON.stringify({ printed }),
    }
  );
  return handleResponse<CertificateIssuance>(response);
}

export async function downloadIssuancePdf(issuanceId: number): Promise<Blob> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances/${issuanceId}/download`
  );
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function listCertificateTemplateAssets(
  templateId: number
): Promise<CertificateTemplateAssetListResponse> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}/assets`
  );
  return handleResponse<CertificateTemplateAssetListResponse>(response);
}

export async function uploadCertificateTemplateAsset(
  templateId: number,
  file: File,
  key: string,
  label?: string
): Promise<CertificateTemplateAsset> {
  const form = new FormData();
  form.append("file", file);
  form.append("key", key);
  if (label) form.append("label", label);
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Do not set Content-Type — browser must set multipart boundary for FormData
  const response = await fetch(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}/assets`,
    {
      method: "POST",
      headers,
      body: form,
    }
  );
  return handleResponse<CertificateTemplateAsset>(response);
}

export function getCertificateTemplateAssetUrl(templateId: number, assetKey: string): string {
  return `${API_BASE_URL}/api/v1/certificates/templates/${templateId}/assets/${encodeURIComponent(assetKey)}/file`;
}

export async function deleteCertificateTemplateAsset(
  templateId: number,
  assetKey: string
): Promise<void> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/templates/${templateId}/assets/${encodeURIComponent(assetKey)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    await handleResponse(response);
  }
}

// --- Phase 3: batch + ledger ---

export async function createCertificateBatch(body: {
  exam_id: number;
  school_id: number;
  programme_id?: number | null;
  template_id?: number | null;
  issuance_date?: string | null;
  only_fully_graded?: boolean;
  reissue_existing?: boolean;
}): Promise<CertificateBatchJob> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/certificates/batches`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return handleResponse<CertificateBatchJob>(response);
}

export async function listCertificateBatches(options: {
  examId?: number;
  schoolId?: number;
  limit?: number;
} = {}): Promise<CertificateBatchJobListResponse> {
  const params = new URLSearchParams();
  if (options.examId != null) params.append("exam_id", String(options.examId));
  if (options.schoolId != null) params.append("school_id", String(options.schoolId));
  if (options.limit != null) params.append("limit", String(options.limit));
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/batches${qs ? `?${qs}` : ""}`
  );
  return handleResponse<CertificateBatchJobListResponse>(response);
}

export async function getCertificateBatch(jobId: number): Promise<CertificateBatchJob> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/batches/${jobId}`
  );
  return handleResponse<CertificateBatchJob>(response);
}

export async function cancelCertificateBatch(jobId: number): Promise<CertificateBatchJob> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/batches/${jobId}/cancel`,
    { method: "POST" }
  );
  return handleResponse<CertificateBatchJob>(response);
}

export async function downloadCertificateBatchZip(jobId: number): Promise<Blob> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/batches/${jobId}/download`
  );
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function listCertificateIssuances(options: {
  examId?: number;
  schoolId?: number;
  programmeId?: number;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<CertificateIssuanceLedgerResponse> {
  const params = new URLSearchParams();
  if (options.examId != null) params.append("exam_id", String(options.examId));
  if (options.schoolId != null) params.append("school_id", String(options.schoolId));
  if (options.programmeId != null) params.append("programme_id", String(options.programmeId));
  if (options.status) params.append("status", options.status);
  if (options.search) params.append("search", options.search);
  if (options.page != null) params.append("page", String(options.page));
  if (options.pageSize != null) params.append("page_size", String(options.pageSize));
  const qs = params.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances${qs ? `?${qs}` : ""}`
  );
  return handleResponse<CertificateIssuanceLedgerResponse>(response);
}

export async function bulkMarkCertificatesPrinted(
  issuanceIds: number[],
  printed = true
): Promise<CertificateIssuance[]> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances/bulk-mark-printed`,
    {
      method: "POST",
      body: JSON.stringify({ issuance_ids: issuanceIds, printed }),
    }
  );
  return handleResponse<CertificateIssuance[]>(response);
}

export async function voidCertificateIssuance(
  issuanceId: number,
  reason: string
): Promise<CertificateIssuance> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances/${issuanceId}/void`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
  return handleResponse<CertificateIssuance>(response);
}

export async function setIssuanceCertificateNumber(
  issuanceId: number,
  certificateNumber: string
): Promise<CertificateIssuance> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/issuances/${issuanceId}/certificate-number`,
    {
      method: "PATCH",
      body: JSON.stringify({ certificate_number: certificateNumber }),
    }
  );
  return handleResponse<CertificateIssuance>(response);
}

export async function createCertificateScanBatch(body: {
  exam_id: number;
  roi_certificate_number: { x: number; y: number; w: number; h: number };
  roi_index_number: { x: number; y: number; w: number; h: number };
}): Promise<CertificateScanBatch> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/certificates/studio/batches`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return handleResponse<CertificateScanBatch>(response);
}

export async function getCertificateScanBatch(batchId: number): Promise<CertificateScanBatch> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/batches/${batchId}`
  );
  return handleResponse<CertificateScanBatch>(response);
}

export async function uploadCertificateScans(
  batchId: number,
  files: File[]
): Promise<CertificateScan[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(
    `${API_BASE_URL}/api/v1/certificates/studio/batches/${batchId}/scans`,
    { method: "POST", headers, body: form }
  );
  return handleResponse<CertificateScan[]>(response);
}

export async function processCertificateScanBatch(
  batchId: number
): Promise<CertificateScanBatch> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/batches/${batchId}/process`,
    { method: "POST" }
  );
  return handleResponse<CertificateScanBatch>(response);
}

export async function listCertificateScans(params?: {
  matchStatus?: string;
  examId?: number;
  batchId?: number;
  page?: number;
  pageSize?: number;
}): Promise<CertificateScanListResponse> {
  const q = new URLSearchParams();
  if (params?.matchStatus) q.set("match_status", params.matchStatus);
  if (params?.examId != null) q.set("exam_id", String(params.examId));
  if (params?.batchId != null) q.set("batch_id", String(params.batchId));
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.pageSize != null) q.set("page_size", String(params.pageSize));
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/scans?${q.toString()}`
  );
  return handleResponse<CertificateScanListResponse>(response);
}

export function certificateScanImageUrl(scanId: number): string {
  return `${API_BASE_URL}/api/v1/certificates/studio/scans/${scanId}/image`;
}

export async function fetchCertificateScanImageBlob(scanId: number): Promise<Blob> {
  const response = await fetchWithAuth(certificateScanImageUrl(scanId));
  if (!response.ok) {
    throw new Error("Failed to load scan image");
  }
  return response.blob();
}

export async function confirmCertificateScan(
  scanId: number,
  body?: { certificate_number?: string; index_number?: string }
): Promise<CertificateScan> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/scans/${scanId}/confirm`,
    { method: "POST", body: JSON.stringify(body || {}) }
  );
  return handleResponse<CertificateScan>(response);
}

export async function manualMatchCertificateScan(
  scanId: number,
  body: {
    exam_registration_id?: number;
    index_number?: string;
    certificate_number?: string;
  }
): Promise<CertificateScan> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/scans/${scanId}/match`,
    { method: "POST", body: JSON.stringify(body) }
  );
  return handleResponse<CertificateScan>(response);
}

export async function rejectCertificateScan(scanId: number): Promise<CertificateScan> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/scans/${scanId}/reject`,
    { method: "POST" }
  );
  return handleResponse<CertificateScan>(response);
}

export async function listIssueFormCandidates(
  examId: number,
  schoolId: number,
  options: {
    includeUnnumbered?: boolean;
    programmeId?: number;
    search?: string;
    numberStatus?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<IssueFormCandidatesResponse> {
  const q = new URLSearchParams();
  if (options.includeUnnumbered) {
    q.set("include_unnumbered", "true");
  }
  if (options.programmeId != null) {
    q.set("programme_id", String(options.programmeId));
  }
  if (options.search) q.set("search", options.search);
  if (options.numberStatus) q.set("number_status", options.numberStatus);
  if (options.page != null) q.set("page", String(options.page));
  if (options.pageSize != null) q.set("page_size", String(options.pageSize));
  const qs = q.toString();
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/exams/${examId}/schools/${schoolId}/issue-form-candidates${
      qs ? `?${qs}` : ""
    }`
  );
  return handleResponse<IssueFormCandidatesResponse>(response);
}

export async function downloadCertificateIssueForm(
  examId: number,
  schoolId: number,
  options: { includeUnnumbered?: boolean; programmeId?: number } = {}
): Promise<Blob> {
  const q = new URLSearchParams({
    exam_id: String(examId),
    school_id: String(schoolId),
  });
  if (options.includeUnnumbered) {
    q.set("include_unnumbered", "true");
  }
  if (options.programmeId != null) {
    q.set("programme_id", String(options.programmeId));
  }
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/v1/certificates/studio/issue-form?${q.toString()}`
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || "Failed to download issue form"
    );
  }
  return response.blob();
}

// Insights API Functions

export interface FilterInfo {
  region: string | null;
  zone: string | null;
  school_id: number | null;
  school_name: string | null;
}

export interface ComponentStats {
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  std_deviation: number | null;
}

export interface SubjectPerformanceStatistics {
  exam_subject_id: number;
  subject_code: string;
  subject_name: string;
  filters: FilterInfo;
  total_candidates: number;
  processed_candidates: number;
  absent_candidates: number;
  pending_candidates: number;
  mean_score: number | null;
  median_score: number | null;
  min_score: number | null;
  max_score: number | null;
  std_deviation: number | null;
  skewness: number | null;
  kurtosis: number | null;
  percentiles: {
    "25th": number;
    "50th": number;
    "75th": number;
    "90th": number;
    "95th": number;
  };
  grade_distribution: Record<string, number>;
  grade_percentages: Record<string, number>;
  pass_rate: number | null;
  obj_stats: ComponentStats | null;
  essay_stats: ComponentStats | null;
  pract_stats: ComponentStats | null;
}

export interface BinData {
  range_label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
  grade_breakdown: Record<string, number> | null;
}

export interface HistogramData {
  bins: BinData[];
  bin_size: number;
  total_count: number;
  excluded_count: number;
  filters: FilterInfo;
}

export interface SchoolOption {
  id: number;
  code: string;
  name: string;
  region: string;
  zone: string;
  candidate_count: number;
}

export interface FilterOptions {
  regions: string[];
  zones: string[];
  schools: SchoolOption[];
}

export interface RawScoresResponse {
  scores: number[];
  total_count: number;
  processed_count: number;
  filters: FilterInfo;
}

/**
 * Get performance statistics for an exam subject.
 */
export async function getSubjectPerformanceStatistics(
  examSubjectId: number,
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  },
  testGradeRanges?: GradeRangeConfig[],
  includePending?: boolean,
  includeAbsent?: boolean
): Promise<SubjectPerformanceStatistics> {
  const params = new URLSearchParams();
  if (filters?.region) params.append("region", filters.region);
  if (filters?.zone) params.append("zone", filters.zone);
  if (filters?.schoolId) params.append("school_id", filters.schoolId.toString());
  if (testGradeRanges) {
    params.append("grade_ranges_json", JSON.stringify(testGradeRanges));
  }
  if (includePending !== undefined) {
    params.append("include_pending", includePending.toString());
  }
  if (includeAbsent !== undefined) {
    params.append("include_absent", includeAbsent.toString());
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/statistics?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return handleResponse<SubjectPerformanceStatistics>(response);
}

/**
 * Get histogram data for score distribution.
 */
export async function getSubjectHistogram(
  examSubjectId: number,
  binSize?: number,
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  },
  testGradeRanges?: GradeRangeConfig[],
  includePending?: boolean,
  includeAbsent?: boolean
): Promise<HistogramData> {
  const params = new URLSearchParams();
  if (binSize !== undefined) params.append("bin_size", binSize.toString());
  if (filters?.region) params.append("region", filters.region);
  if (filters?.zone) params.append("zone", filters.zone);
  if (filters?.schoolId) params.append("school_id", filters.schoolId.toString());
  if (testGradeRanges) {
    params.append("grade_ranges_json", JSON.stringify(testGradeRanges));
  }
  if (includePending !== undefined) {
    params.append("include_pending", includePending.toString());
  }
  if (includeAbsent !== undefined) {
    params.append("include_absent", includeAbsent.toString());
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/histogram?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return handleResponse<HistogramData>(response);
}

/**
 * Get raw scores array for an exam subject.
 * Returns actual score values, not histogram bins.
 */
export async function getSubjectRawScores(
  examSubjectId: number,
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  },
  includePending?: boolean,
  includeAbsent?: boolean
): Promise<RawScoresResponse> {
  const params = new URLSearchParams();
  if (filters?.region) params.append("region", filters.region);
  if (filters?.zone) params.append("zone", filters.zone);
  if (filters?.schoolId) params.append("school_id", filters.schoolId.toString());
  if (includePending !== undefined) {
    params.append("include_pending", includePending.toString());
  }
  if (includeAbsent !== undefined) {
    params.append("include_absent", includeAbsent.toString());
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/scores?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return handleResponse<RawScoresResponse>(response);
}

/**
 * Get available filter options for an exam subject.
 */
export async function getSubjectFilterOptions(examSubjectId: number): Promise<FilterOptions> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/filter-options`,
    {
      method: "GET",
    }
  );
  return handleResponse<FilterOptions>(response);
}

// Scores Analysis Types
export type ScoringMethod =
  | "norm_referenced"
  | "criterion_referenced"
  | "statistical_std"
  | "statistical_zscore"
  | "fixed_distribution"
  | "modified_curve"
  | "mastery_based"
  | "hybrid";

export interface BoundarySet {
  method: ScoringMethod;
  method_name: string;
  boundaries: Record<string, number>;
  description?: string | null;
  adjustments?: Record<string, any> | null;
}

export interface GradeDistribution {
  grade_counts: Record<string, number>;
  grade_percentages: Record<string, number>;
  pass_rate: number | null;
  distinction_rate: number | null;
}

export interface BorderlineAnalysis {
  grade: string;
  cutoff: number;
  borderline_count: number;
  borderline_percentage: number;
}

export interface ImpactMetrics {
  total_students: number;
  pass_rate: number | null;
  distinction_rate: number | null;
  average_grade_gap: number | null;
  borderline_candidates: BorderlineAnalysis[];
  warnings: string[];
  recommendations: string[];
}

export interface MethodAnalysis {
  method: ScoringMethod;
  method_name: string;
  boundaries: BoundarySet;
  grade_distribution: GradeDistribution;
  impact_metrics: ImpactMetrics;
  score_statistics: Record<string, number | null>;
  scores: number[];
}

export interface MethodComparisonItem {
  method: ScoringMethod;
  method_name: string;
  boundaries: Record<string, number>;
  grade_distribution: GradeDistribution;
  impact_metrics: ImpactMetrics;
}

export interface ImpactComparison {
  students_affected: Record<string, number>;
  grade_changes: Record<string, Record<string, number>>;
}

export interface MethodComparison {
  methods: MethodComparisonItem[];
  impact_comparison: ImpactComparison | null;
  recommendations: string[];
  scores: number[];
}

/**
 * Analyze a single scoring method for boundary setting.
 */
export async function analyzeBoundaryMethod(
  examSubjectId: number,
  method: ScoringMethod,
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  },
  includePending?: boolean,
  includeAbsent?: boolean
): Promise<MethodAnalysis> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/boundary-analysis`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method,
        region: filters?.region || null,
        zone: filters?.zone || null,
        school_id: filters?.schoolId || null,
        include_pending: includePending || false,
        include_absent: includeAbsent || false,
      }),
    }
  );
  return handleResponse<MethodAnalysis>(response);
}

/**
 * Compare multiple scoring methods for boundary setting.
 */
export async function compareBoundaryMethods(
  examSubjectId: number,
  methods: ScoringMethod[],
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  },
  includePending?: boolean,
  includeAbsent?: boolean
): Promise<MethodComparison> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/insights/exam-subject/${examSubjectId}/boundary-comparison`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        methods,
        region: filters?.region || null,
        zone: filters?.zone || null,
        school_id: filters?.schoolId || null,
        include_pending: includePending || false,
        include_absent: includeAbsent || false,
      }),
    }
  );
  return handleResponse<MethodComparison>(response);
}

// Authentication API Functions

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/** Expected login failure (wrong credentials, validation) — not a crash. */
export class LoginError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LoginError";
    this.status = status;
  }
}

/**
 * Login user and get access token.
 */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  // Handle login response separately to preserve actual error messages
  if (!response.ok) {
    let errorDetail = `HTTP error! status: ${response.status}`;

    try {
      const contentType = response.headers.get("content-type");
      const text = await response.text();

      if (contentType && contentType.includes("application/json") && text) {
        try {
          const error: ApiError = JSON.parse(text);
          const detail = error.detail;
          errorDetail =
            typeof detail === "string"
              ? detail
              : detail
                ? JSON.stringify(detail)
                : text;
        } catch {
          errorDetail = text;
        }
      } else if (text) {
        errorDetail = text;
      }
    } catch {
      errorDetail = `HTTP error! status: ${response.status}`;
    }

    throw new LoginError(errorDetail, response.status);
  }

  const tokenData = await response.json();

  // Store both tokens
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_token", tokenData.access_token);
    localStorage.setItem("refresh_token", tokenData.refresh_token);
  }

  return tokenData;
}

const CURRENT_USER_CACHE_TTL_MS = 5 * 60 * 1000;
let currentUserCache: { expiresAt: number; promise: Promise<User> } | null = null;

/**
 * Get current authenticated user information.
 */
export async function getCurrentUser(): Promise<User> {
  const now = Date.now();
  if (currentUserCache && currentUserCache.expiresAt > now) {
    return currentUserCache.promise;
  }
  const promise = fetchWithAuth(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
  }).then((response) => handleResponse<User>(response));
  currentUserCache = {
    expiresAt: now + CURRENT_USER_CACHE_TTL_MS,
    promise,
  };
  try {
    return await promise;
  } catch (err) {
    currentUserCache = null;
    throw err;
  }
}

export function clearCurrentUserCache() {
  currentUserCache = null;
}

/**
 * Register a new user (requires Registrar or higher role).
 */
export async function registerUser(data: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      full_name: data.full_name,
      role: data.role, // FastAPI will convert string to UserRole enum
    }),
  });
  return handleResponse<User>(response);
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshAccessToken(): Promise<TokenResponse> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    // Refresh token expired or invalid - clear tokens
    clearTokens();
    let errorDetail = `HTTP error! status: ${response.status}`;

    try {
      const contentType = response.headers.get("content-type");
      const text = await response.text();

      if (contentType && contentType.includes("application/json") && text) {
        try {
          const error: ApiError = JSON.parse(text);
          errorDetail = error.detail || text;
        } catch {
          errorDetail = text;
        }
      } else if (text) {
        errorDetail = text;
      }
    } catch (e) {
      errorDetail = `HTTP error! status: ${response.status}`;
    }

    throw new Error(errorDetail);
  }

  const tokenData = await response.json();

  // Update stored tokens
  setTokens(tokenData.access_token, tokenData.refresh_token);

  return tokenData;
}

/**
 * Logout user (revokes refresh token and clears tokens from localStorage).
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();

  // Try to revoke refresh token on backend
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      // Ignore errors - still clear tokens locally
      console.error("Error revoking refresh token:", error);
    }
  }

  // Clear tokens from localStorage
  clearTokens();
  clearCurrentUserCache();
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

// User Management API Functions

/**
 * List users with pagination and filters.
 */
export async function listUsers(
  filters?: UserListFilters
): Promise<User[]> {
  const params = new URLSearchParams();
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.page_size) params.append("page_size", filters.page_size.toString());
  if (filters?.role) params.append("role", filters.role);
  if (filters?.is_active !== undefined) params.append("is_active", filters.is_active.toString());
  if (filters?.search) params.append("search", filters.search);

  const response = await fetch(`${API_BASE_URL}/api/v1/users?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  return handleResponse<User[]>(response);
}

/**
 * Get a single user by ID.
 */
export async function getUser(userId: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  return handleResponse<User>(response);
}

/**
 * Update a user.
 */
export async function updateUser(userId: string, data: UserUpdate): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

/**
 * Delete a user (SUPER_ADMIN only).
 */
export async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

/**
 * Reset a user's password (SUPER_ADMIN only).
 */
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/reset-password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}

/**
 * Update current user's own profile (name only).
 */
export async function updateCurrentUser(data: { full_name?: string }): Promise<User> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

/**
 * Change current user's own password.
 */
export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/v1/auth/me/change-password`, {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
}
