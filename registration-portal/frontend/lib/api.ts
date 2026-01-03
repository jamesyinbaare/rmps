import type {
  User,
  Token,
  School,
  SchoolDetail,
  SchoolStatistics,
  SchoolListResponse,
  SchoolExam,
  CandidateListResponse,
  RegistrationCandidate,
  RegistrationCandidateCreate,
  RegistrationExam,
  RegistrationExamCreate,
  SchoolAdminCreate,
  Programme,
  ProgrammeListResponse,
  ProgrammeBulkUploadResponse,
  ProgrammeSubjectRequirements,
  Subject,
  SubjectListResponse,
  SubjectBulkUploadResponse,
  PhotoAlbumResponse,
  PhotoAlbumItem,
  PhotoBulkUploadResponse,
  RegistrationCandidatePhoto,
  BulkUploadResponse,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

// Token management
const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Track if we're currently refreshing to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<Token> | null = null;

/**
 * Refresh access token using refresh token.
 */
async function refreshAccessToken(): Promise<Token> {
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
          const error = JSON.parse(text);
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
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
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

    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Auth API
export async function login(email: string, password: string): Promise<Token> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const token = await handleResponse<Token>(response);
  setTokens(token.access_token, token.refresh_token);
  return token;
}

export async function getCurrentUser(): Promise<User> {
  const response = await fetchWithAuth("/api/v1/auth/me");
  return handleResponse<User>(response);
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();

  // Try to revoke refresh token on backend
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      // Ignore errors - still clear tokens locally
      console.error("Error revoking refresh token:", error);
    }
  }

  // Clear tokens from localStorage
  clearTokens();
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

// Admin API - Schools
export async function getSchools(
  page: number = 1,
  pageSize: number = 20,
  search?: string,
  isActive?: boolean
): Promise<SchoolListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (search) params.append("search", search);
  if (isActive !== undefined) params.append("is_active", isActive.toString());

  const response = await fetchWithAuth(`/api/v1/admin/schools?${params.toString()}`);
  return handleResponse<SchoolListResponse>(response);
}

export async function listSchools(): Promise<School[]> {
  const response = await fetchWithAuth("/api/v1/admin/schools/simple");
  return handleResponse<School[]>(response);
}

export async function getSchool(schoolId: number): Promise<SchoolDetail> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}`);
  return handleResponse<SchoolDetail>(response);
}

export async function getSchoolStatistics(schoolId: number): Promise<SchoolStatistics> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}/statistics`);
  return handleResponse<SchoolStatistics>(response);
}

export async function getSchoolAdmins(schoolId: number): Promise<User[]> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}/admins`);
  return handleResponse<User[]>(response);
}

// Alias for consistency with new terminology
export const getCoordinators = getSchoolAdmins;

export async function getSchoolCandidates(
  schoolId: number,
  examId?: number,
  status?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<CandidateListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (examId) params.append("exam_id", examId.toString());
  if (status) params.append("status", status);

  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}/candidates?${params.toString()}`);
  return handleResponse<CandidateListResponse>(response);
}

export async function getSchoolExams(schoolId: number): Promise<SchoolExam[]> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}/exams`);
  return handleResponse<SchoolExam[]>(response);
}

export async function updateSchool(
  schoolId: number,
  data: { name?: string; is_active?: boolean }
): Promise<SchoolDetail> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<SchoolDetail>(response);
}

export async function createSchool(data: { code: string; name: string }): Promise<SchoolDetail> {
  const response = await fetchWithAuth("/api/v1/admin/schools", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<SchoolDetail>(response);
}

export interface BulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: Array<{
    row_number: number;
    error_message: string;
    field?: string | null;
  }>;
}

export async function bulkUploadSchools(file: File): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getAccessToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Don't set Content-Type for FormData - browser will set it with boundary

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/schools/bulk`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse<BulkUploadResponse>(response);
}

export async function createSchoolAdmin(data: SchoolAdminCreate): Promise<User> {
  const response = await fetchWithAuth("/api/v1/admin/school-admin-users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

// Alias for consistency with new terminology
export const createCoordinator = createSchoolAdmin;

export async function listSchoolAdmins(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/admin/school-admin-users");
  return handleResponse<User[]>(response);
}

// Alias for consistency with new terminology
export const listCoordinators = listSchoolAdmins;

export async function createExam(data: RegistrationExamCreate): Promise<RegistrationExam> {
  const response = await fetchWithAuth("/api/v1/admin/exams", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<RegistrationExam>(response);
}

export async function listExams(): Promise<RegistrationExam[]> {
  const response = await fetchWithAuth("/api/v1/admin/exams");
  return handleResponse<RegistrationExam[]>(response);
}

export async function getExam(id: number): Promise<RegistrationExam> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${id}`);
  return handleResponse<RegistrationExam>(response);
}

// School API - For coordinators
export interface SchoolUserCreate {
  email: string;
  password: string;
  full_name: string;
}

export interface SchoolUserUpdate {
  full_name?: string;
  is_active?: boolean;
}

export interface SchoolDashboardData {
  school: {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
  };
  active_user_count: number;
  max_active_users: number;
  total_candidates: number;
  candidates_by_status: Record<string, number>;
  total_exams: number;
}

export async function getSchoolDashboard(): Promise<SchoolDashboardData> {
  const response = await fetchWithAuth("/api/v1/school/dashboard");
  return handleResponse<SchoolDashboardData>(response);
}

export async function createSchoolUser(data: SchoolUserCreate): Promise<User> {
  const response = await fetchWithAuth("/api/v1/school/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

export async function listSchoolUsers(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/school/users");
  return handleResponse<User[]>(response);
}

export async function updateSchoolUser(userId: string, data: SchoolUserUpdate): Promise<User> {
  const response = await fetchWithAuth(`/api/v1/school/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<User>(response);
}

// School candidate registration
export async function listSchoolCandidates(examId?: number): Promise<RegistrationCandidate[]> {
  const params = examId ? `?exam_id=${examId}` : "";
  const response = await fetchWithAuth(`/api/v1/school/candidates${params}`);
  return handleResponse<RegistrationCandidate[]>(response);
}

export async function registerCandidate(
  examId: number,
  candidateData: RegistrationCandidateCreate
): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/school/candidates?exam_id=${examId}`, {
    method: "POST",
    body: JSON.stringify(candidateData),
  });
  return handleResponse<RegistrationCandidate>(response);
}

export async function updateCandidate(
  candidateId: number,
  candidateData: Partial<RegistrationCandidateCreate>
): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}`, {
    method: "PUT",
    body: JSON.stringify(candidateData),
  });
  return handleResponse<RegistrationCandidate>(response);
}

export async function listAvailableExams(): Promise<RegistrationExam[]> {
  const response = await fetchWithAuth("/api/v1/school/exams");
  return handleResponse<RegistrationExam[]>(response);
}

// School API - Programme Management
export async function listSchoolProgrammes(): Promise<Programme[]> {
  const response = await fetchWithAuth("/api/v1/school/programmes");
  return handleResponse<Programme[]>(response);
}

export async function listAvailableProgrammes(): Promise<Programme[]> {
  const response = await fetchWithAuth("/api/v1/school/programmes/available");
  return handleResponse<Programme[]>(response);
}

export async function associateProgrammeWithSchool(programmeId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}`, {
    method: "POST",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function removeProgrammeFromSchool(programmeId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function getProgramme(programmeId: number): Promise<Programme> {
  // Try admin endpoint first (for SYSTEM_ADMIN), fallback to school endpoint (for SCHOOL_ADMIN/SCHOOL_USER)
  try {
    const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}`);
    // If we get a 403, it means the user is not a SYSTEM_ADMIN, so fall back to school endpoint
    if (response.status === 403) {
      const schoolResponse = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}`);
      return handleResponse<Programme>(schoolResponse);
    }
    return handleResponse<Programme>(response);
  } catch (error) {
    // If admin endpoint fails for any other reason, try school endpoint
    const response = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}`);
    return handleResponse<Programme>(response);
  }
}

export async function getProgrammeSubjects(programmeId: number): Promise<ProgrammeSubjectRequirements> {
  // Try admin endpoint first (for SYSTEM_ADMIN), fallback to school endpoint (for SCHOOL_ADMIN/SCHOOL_USER)
  try {
    const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}/subject-requirements`);
    // If we get a 403, it means the user is not a SYSTEM_ADMIN, so fall back to school endpoint
    if (response.status === 403) {
      const schoolResponse = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}/subjects`);
      return handleResponse<ProgrammeSubjectRequirements>(schoolResponse);
    }
    return handleResponse<ProgrammeSubjectRequirements>(response);
  } catch (error) {
    // If admin endpoint fails for any other reason, try school endpoint
    const response = await fetchWithAuth(`/api/v1/school/programmes/${programmeId}/subjects`);
    return handleResponse<ProgrammeSubjectRequirements>(response);
  }
}

export async function bulkUploadCandidates(
  examId: number,
  file: File,
  defaultChoiceGroupSelection?: Record<number, string>
): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_id", examId.toString());
  if (defaultChoiceGroupSelection) {
    formData.append("default_choice_group_selection", JSON.stringify(defaultChoiceGroupSelection));
  }

  const response = await fetchWithAuth("/api/v1/school/candidates/bulk", {
    method: "POST",
    body: formData,
  });
  return handleResponse<BulkUploadResponse>(response);
}

export async function downloadCandidateTemplate(): Promise<Blob> {
  const response = await fetchWithAuth("/api/v1/school/candidates/template");
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

// Admin API - Programmes
export async function listProgrammes(page: number = 1, pageSize: number = 20): Promise<ProgrammeListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  const response = await fetchWithAuth(`/api/v1/admin/programmes?${params.toString()}`);
  return handleResponse<ProgrammeListResponse>(response);
}

export async function createProgramme(data: { code: string; name: string }): Promise<Programme> {
  const response = await fetchWithAuth("/api/v1/admin/programmes", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<Programme>(response);
}

export async function updateProgramme(programmeId: number, data: { code?: string; name?: string }): Promise<Programme> {
  const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<Programme>(response);
}

export async function addSubjectToProgramme(
  programmeId: number,
  subjectId: number,
  data: { is_compulsory?: boolean | null; choice_group_id?: number | null }
): Promise<{ programme_id: number; subject_id: number; subject_type: string; is_compulsory: boolean | null; choice_group_id: number | null }> {
  const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}/subjects/${subjectId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function updateProgrammeSubject(
  programmeId: number,
  subjectId: number,
  data: { is_compulsory?: boolean | null; choice_group_id?: number | null }
): Promise<{ programme_id: number; subject_id: number; subject_type: string; is_compulsory: boolean | null; choice_group_id: number | null }> {
  const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}/subjects/${subjectId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function removeSubjectFromProgramme(programmeId: number, subjectId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}/subjects/${subjectId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function listAllSubjects(): Promise<Subject[]> {
  const response = await fetchWithAuth("/api/v1/admin/subjects?page=1&page_size=1000");
  const data = await handleResponse<SubjectListResponse>(response);
  return data.items;
}

export async function deleteProgramme(programmeId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/programmes/${programmeId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function uploadProgrammesBulk(file: File): Promise<ProgrammeBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth("/api/v1/admin/programmes/bulk-upload", {
    method: "POST",
    body: formData,
  });
  return handleResponse<ProgrammeBulkUploadResponse>(response);
}

export async function downloadProgrammeTemplate(): Promise<Blob> {
  const response = await fetchWithAuth("/api/v1/admin/programmes/template");
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

// Admin API - Subjects
export async function listSubjects(page: number = 1, pageSize: number = 20): Promise<SubjectListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  const response = await fetchWithAuth(`/api/v1/admin/subjects?${params.toString()}`);
  return handleResponse<SubjectListResponse>(response);
}

export async function createSubject(data: { code: string; name: string; subject_type: "CORE" | "ELECTIVE" }): Promise<Subject> {
  const response = await fetchWithAuth("/api/v1/admin/subjects", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<Subject>(response);
}

export async function updateSubject(subjectId: number, data: { code?: string; name?: string; subject_type?: "CORE" | "ELECTIVE" }): Promise<Subject> {
  const response = await fetchWithAuth(`/api/v1/admin/subjects/${subjectId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<Subject>(response);
}

export async function deleteSubject(subjectId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/subjects/${subjectId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function uploadSubjectsBulk(file: File): Promise<SubjectBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth("/api/v1/admin/subjects/bulk-upload", {
    method: "POST",
    body: formData,
  });
  return handleResponse<SubjectBulkUploadResponse>(response);
}

export async function downloadSubjectTemplate(): Promise<Blob> {
  const response = await fetchWithAuth("/api/v1/admin/subjects/template");
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

// School API - Photo Album
export async function getPhotoAlbum(
  page: number = 1,
  pageSize: number = 10000,
  examId?: number,
  programmeId?: number,
  hasPhoto?: boolean
): Promise<PhotoAlbumResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (examId) params.append("exam_id", examId.toString());
  if (programmeId) params.append("programme_id", programmeId.toString());
  if (hasPhoto !== undefined) params.append("has_photo", hasPhoto.toString());

  const response = await fetchWithAuth(`/api/v1/school/candidates/photos/album?${params.toString()}`);
  return handleResponse<PhotoAlbumResponse>(response);
}

export async function getPhotoFile(candidateId: number): Promise<string | null> {
  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}/photos/file`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    await handleResponse(response);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function bulkUploadPhotos(examId: number, files: File[]): Promise<PhotoBulkUploadResponse> {
  const formData = new FormData();
  formData.append("exam_id", examId.toString());
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetchWithAuth("/api/v1/school/candidates/photos/bulk-upload", {
    method: "POST",
    body: formData,
  });
  return handleResponse<PhotoBulkUploadResponse>(response);
}

export async function uploadCandidatePhoto(candidateId: number, file: File): Promise<RegistrationCandidatePhoto> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}/photos`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<RegistrationCandidatePhoto>(response);
}

export async function getCandidatePhoto(candidateId: number): Promise<RegistrationCandidatePhoto | null> {
  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}/photos`);
  if (response.status === 404) {
    return null;
  }
  return handleResponse<RegistrationCandidatePhoto>(response);
}

export async function deleteCandidatePhoto(candidateId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}/photos`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}
