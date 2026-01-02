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
  RegistrationExam,
  RegistrationExamCreate,
  SchoolAdminCreate,
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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  headers.set("Content-Type", "application/json");

  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });
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
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }
  clearTokens();
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
