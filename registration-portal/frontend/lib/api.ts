import type {
  User,
  Role,
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
  AdminUserCreate,
  UserPasswordReset,
  UserUpdate,
  UserListResponse,
  UserListFilters,
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
  CandidateResult,
  CandidateResultBulkPublish,
  CandidateResultBulkPublishResponse,
  ResultBlock,
  ResultBlockCreate,
  PublicResultCheckRequest,
  PublicResultResponse,
  IndexNumberGenerationJob,
  ExaminationSchedule,
  ExaminationScheduleCreate,
  ExaminationScheduleUpdate,
  ExaminationScheduleBulkUploadResponse,
  ApiKey,
  ApiKeyCreateResponse,
  ApiKeyUsageStats,
  CreditBalance,
  CreditPurchaseRequest,
  CreditPurchaseResponse,
  CreditTransactionListResponse,
  BulkVerificationRequest,
  BulkVerificationResponse,
  ApiUser,
  ApiUserListResponse,
  ApiUserDetail,
  ApiUserUsageStats,
  ProgrammePricingResponse,
  ProgrammePricingCreate,
  ProgrammePricingBulkUpdate,
  ExamPricingResponse,
  ImportPricingRequest,
  SubjectPricingResponse,
  SubjectPricingCreate,
  SubjectPricingBulkUpdate,
  TieredPricingResponse,
  TieredPricingCreate,
  TieredPricingBulkUpdate,
  ApplicationFeeResponse,
  ApplicationFeeCreate,
  ExamPricingModelResponse,
  ExamPricingModelCreate,
  Invoice,
  TimetableDownloadFilter,
  TimetableResponse,
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

    // Provide user-friendly error message
    if (response.status >= 500) {
      throw new Error("The server is experiencing issues. Please try again later.");
    } else {
      // For auth errors, use a generic message
      throw new Error("Your session has expired. Please log in again.");
    }
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
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> {
  const maxRetries = 1; // Only retry once after token refresh

  // Add auth headers
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Create new options without headers to avoid conflicts
  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    body: options.body,
    cache: options.cache,
    credentials: "include" as RequestCredentials, // Include credentials for CORS
    integrity: options.integrity,
    keepalive: options.keepalive,
    mode: "cors" as RequestMode, // Explicitly set CORS mode
    redirect: options.redirect,
    referrer: options.referrer,
    referrerPolicy: options.referrerPolicy,
    signal: options.signal,
    window: options.window,
    headers: headers as HeadersInit,
  };

  const fullUrl = `${API_BASE_URL}${url}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, fetchOptions);
  } catch (error) {
    // Handle network errors (e.g., backend server not running)
    if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message.includes("fetch"))) {
      throw new Error(
        `Unable to connect to the server at ${API_BASE_URL}. Please check your internet connection or try again later.`
      );
    }
    throw error;
  }

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

export async function handleResponse<T>(response: Response): Promise<T> {
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

    // Handle server errors with user-friendly messages
    let errorMessage: string;
    try {
      const error = await response.json().catch(() => ({ detail: response.statusText })) as {
        detail?: string | { errors?: string[]; message?: string } | Array<{ loc: (string | number)[]; msg: string; type: string }>;
        errors?: string[];
        message?: string;
      };

      // Handle 422 validation errors (FastAPI format)
      if (response.status === 422 && Array.isArray(error.detail)) {
        const validationErrors = error.detail.map((err) => {
          const field = err.loc[err.loc.length - 1];
          return `${field}: ${err.msg}`;
        });
        errorMessage = validationErrors.join("; ");
      } else if (typeof error.detail === "object" && error.detail !== null && !Array.isArray(error.detail) && "errors" in error.detail) {
        // Handle PhotoValidationService error format: { detail: { errors: [...], message: "..." } }
        const detail = error.detail as { errors?: string[]; message?: string };
        if (detail.errors && Array.isArray(detail.errors)) {
          errorMessage = detail.errors.join("; ");
        } else {
          errorMessage = detail.message || "Validation failed";
        }
      } else if (typeof error.detail === "string") {
        errorMessage = error.detail;
      } else if (error.errors && Array.isArray(error.errors)) {
        errorMessage = error.errors.join("; ");
      } else if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage = response.statusText;
      }
    } catch {
      errorMessage = response.statusText;
    }

    // Provide user-friendly error messages based on status code
    if (response.status >= 500) {
      errorMessage = "The server is experiencing issues. Please try again later.";
    } else if (response.status === 404) {
      errorMessage = errorMessage || "The requested resource was not found.";
    } else if (response.status === 403) {
      errorMessage = errorMessage || "You don't have permission to perform this action.";
    } else if (response.status === 422) {
      // Keep the detailed validation error message for 422
      errorMessage = errorMessage || "Validation error. Please check your input.";
    } else if (response.status === 400) {
      // Keep the original error message for validation errors (400)
      errorMessage = errorMessage || "Invalid request. Please check your input.";
    } else {
      errorMessage = errorMessage || "An error occurred. Please try again.";
    }

    throw new Error(errorMessage);
  }
  return response.json();
}

// Auth API
export async function login(email: string, password: string): Promise<Token> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const token = await handleResponse<Token>(response);
    setTokens(token.access_token, token.refresh_token);
    return token;
  } catch (error) {
    // Handle network errors with user-friendly message
    if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message.includes("fetch"))) {
      throw new Error("Unable to connect to the server. Please check your internet connection or try again later.");
    }
    throw error;
  }
}

// Role number to name mapping (matches backend Role IntEnum)
const ROLE_MAP: Record<number, Role> = {
  0: "SystemAdmin",
  10: "Director",
  20: "DeputyDirector",
  30: "PrincipalManager",
  40: "SeniorManager",
  50: "Manager",
  60: "Staff",
  70: "SchoolAdmin",
  80: "SchoolStaff",
  90: "PublicUser",
  100: "APIUSER",
};

// Transform user object to convert role number to role name
function transformUser(user: any): User {
  if (user && typeof user.role === "number") {
    user.role = ROLE_MAP[user.role] || user.role;
  }
  return user as User;
}

// Transform array of users
function transformUsers(users: any[]): User[] {
  return users.map(transformUser);
}

export async function getCurrentUser(): Promise<User> {
  const response = await fetchWithAuth("/api/v1/auth/me");
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

export interface UserSelfUpdate {
  full_name: string;
}

export interface UserPasswordChange {
  current_password: string;
  new_password: string;
}

export async function updateCurrentUser(data: UserSelfUpdate): Promise<User> {
  const response = await fetchWithAuth("/api/v1/auth/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

export async function changeCurrentUserPassword(data: UserPasswordChange): Promise<void> {
  const response = await fetchWithAuth("/api/v1/auth/me/change-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export interface PublicUserCreate {
  email: string;
  password: string;
  full_name: string;
}

export async function register(userData: PublicUserCreate): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

// Private User Registration API
export interface PrivateUserRegistrationRequest {
  email: string;
  password: string;
  full_name: string;
  exam_id: number;
  school_id: number;
  name: string;
  date_of_birth?: string;
  gender?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  national_id?: string;
  programme_id?: number;
  subject_ids: number[];
}

export interface PrivateUserRegistrationResponse {
  user: User;
  registration: RegistrationCandidate;
  token: Token;
}

export async function registerPrivateUser(
  data: PrivateUserRegistrationRequest
): Promise<PrivateUserRegistrationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register-private`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await handleResponse<PrivateUserRegistrationResponse>(response);
  result.user = transformUser(result.user);
  setTokens(result.token.access_token, result.token.refresh_token);
  return result;
}

export interface ExaminationCenter {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

export async function listExaminationCenters(examId?: number): Promise<ExaminationCenter[]> {
  const params = new URLSearchParams();
  if (examId) params.append("exam_id", examId.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/private/examination-centers${params.toString() ? `?${params.toString()}` : ""}`
  );
  return handleResponse<ExaminationCenter[]>(response);
}

export async function listExaminationCentersPublic(search?: string): Promise<ExaminationCenter[]> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const params = new URLSearchParams();
  if (search) {
    params.append("search", search);
  }
  const url = `${API_BASE_URL}/api/v1/public/examination-centers${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error("Failed to fetch examination centers");
    return [];
  }

  return await response.json();
}

export interface SubjectListItem {
  id: number;
  code: string;
  name: string;
  subject_type: string;
}

export async function listSubjectsForPrivate(search?: string): Promise<SubjectListItem[]> {
  const params = new URLSearchParams();
  if (search) params.append("search", search);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/private/subjects${params.toString() ? `?${params.toString()}` : ""}`
  );
  return handleResponse<SubjectListItem[]>(response);
}

export async function listAvailableExamsForPrivate(): Promise<RegistrationExam[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/private/exams`);
  return handleResponse<RegistrationExam[]>(response);
}

export interface ProgrammeListItem {
  id: number;
  code: string;
  name: string;
}

export async function listProgrammesForPrivate(): Promise<ProgrammeListItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/private/programmes`);
  return handleResponse<ProgrammeListItem[]>(response);
}

export async function getProgrammeSubjectsForPrivate(
  programmeId: number
): Promise<ProgrammeSubjectRequirements> {
  const response = await fetch(`${API_BASE_URL}/api/v1/private/programmes/${programmeId}/subjects`);
  return handleResponse<ProgrammeSubjectRequirements>(response);
}

// Draft Registration Management
export async function getDraftRegistration(examId?: number): Promise<RegistrationCandidate | null> {
  const params = new URLSearchParams();
  if (examId) params.append("exam_id", examId.toString());
  const response = await fetchWithAuth(`/api/v1/private/registrations/draft${params.toString() ? `?${params.toString()}` : ""}`);
  if (response.status === 404) {
    return null;
  }
  return handleResponse<RegistrationCandidate>(response);
}

export async function saveDraftRegistration(
  examId: number,
  data: RegistrationCandidateCreate
): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/draft?exam_id=${examId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<RegistrationCandidate>(response);
}

export async function submitDraftRegistration(registrationId: number): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<RegistrationCandidate>(response);
}

export interface RegistrationPriceResponse {
  application_fee: number;
  subject_price: number | null;
  tiered_price: number | null;
  total: number;
  pricing_model_used: string;
  payment_required: boolean;
  total_paid_amount: number;
  outstanding_amount: number;
}

export interface PaymentInitializeResponse {
  payment_id: number;
  authorization_url: string;
  paystack_reference: string;
}

export async function getRegistrationPrice(registrationId: number): Promise<RegistrationPriceResponse> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/price`);
  return handleResponse<RegistrationPriceResponse>(response);
}

export async function initializeRegistrationPayment(registrationId: number): Promise<PaymentInitializeResponse> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<PaymentInitializeResponse>(response);
}

export async function getRegistrationPaymentStatus(registrationId: number): Promise<{ total_paid_amount: number; outstanding_amount: number; has_pricing: boolean }> {
  const priceData = await getRegistrationPrice(registrationId);
  return {
    total_paid_amount: priceData.total_paid_amount,
    outstanding_amount: priceData.outstanding_amount,
    has_pricing: priceData.has_pricing || false,
  };
}

export async function getRegistrationForViewing(registrationId: number): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/view`);
  return handleResponse<RegistrationCandidate>(response);
}

export async function enableEditRegistration(registrationId: number): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<RegistrationCandidate>(response);
}

export async function listMyRegistrations(): Promise<RegistrationCandidate[]> {
  const response = await fetchWithAuth("/api/v1/private/registrations");
  return handleResponse<RegistrationCandidate[]>(response);
}

export async function getRegistration(registrationId: number): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}`);
  return handleResponse<RegistrationCandidate>(response);
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
  const users = await handleResponse<User[]>(response);
  return transformUsers(users);
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
  data: {
    name?: string;
    is_active?: boolean;
    is_private_examination_center?: boolean;
    email?: string | null;
    phone?: string | null;
    digital_address?: string | null;
    post_office_address?: string | null;
    is_private?: boolean | null;
    principal_name?: string | null;
    principal_email?: string | null;
    principal_phone?: string | null;
  }
): Promise<SchoolDetail> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<SchoolDetail>(response);
}

export async function getSchoolProfile(): Promise<School> {
  const response = await fetchWithAuth("/api/v1/school/profile");
  return handleResponse<School>(response);
}

export async function updateSchoolProfile(data: {
  email?: string | null;
  phone?: string | null;
  digital_address?: string | null;
  post_office_address?: string | null;
  is_private?: boolean | null;
  principal_name?: string | null;
  principal_email?: string | null;
  principal_phone?: string | null;
}): Promise<School> {
  const response = await fetchWithAuth("/api/v1/school/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<School>(response);
}

export async function createSchool(data: { code: string; name: string; is_private_examination_center?: boolean }): Promise<SchoolDetail> {
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

export async function bulkUploadSchoolAdminUsers(file: File): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getAccessToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Don't set Content-Type for FormData - browser will set it with boundary

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/bulk-upload`, {
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
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

// Alias for consistency with new terminology
export const createCoordinator = createSchoolAdmin;

export async function listSchoolAdmins(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/admin/school-admin-users");
  const users = await handleResponse<User[]>(response);
  return transformUsers(users);
}

// Alias for consistency with new terminology
export const listCoordinators = listSchoolAdmins;

// Admin user management functions
export async function listAdminUsers(filters?: {
  page?: number;
  page_size?: number;
  role?: string | null;
  is_active?: boolean | null;
  search?: string | null;
}): Promise<UserListResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.append("page", filters.page.toString());
  if (filters?.page_size) params.append("page_size", filters.page_size.toString());
  if (filters?.role) params.append("role", filters.role);
  if (filters?.is_active !== undefined && filters?.is_active !== null) {
    params.append("is_active", filters.is_active.toString());
  }
  if (filters?.search) params.append("search", filters.search);

  const queryString = params.toString();
  const url = `/api/v1/admin/users${queryString ? `?${queryString}` : ""}`;
  const response = await fetchWithAuth(url);
  const result = await handleResponse<UserListResponse>(response);
  // Transform the items in the response
  return {
    ...result,
    items: transformUsers(result.items),
  };
}

// Functions for fetching specific user groups for admin settings page
export async function listPublicUsers(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/admin/public-users");
  const users = await handleResponse<User[]>(response);
  return transformUsers(users);
}

export async function listSchoolStaffUsers(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/admin/school-staff-users");
  const users = await handleResponse<User[]>(response);
  return transformUsers(users);
}

// Fetch CTVET Staff users (SystemAdmin, Director, DeputyDirector, PrincipalManager, SeniorManager, Manager, Staff)
// Note: listAdminUsers excludes PublicUser and SchoolStaff, but includes SchoolAdmin
// So we fetch all and filter client-side to exclude SchoolAdmin
export async function listCtvetStaffUsers(filters?: {
  page?: number;
  page_size?: number;
  is_active?: boolean | null;
  search?: string | null;
}): Promise<UserListResponse> {
  const ctvetRoles = ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"];

  // Fetch with maximum allowed page size (100) to get as many users as possible
  // If we need more, we'll need to implement pagination
  const pageSize = filters?.page_size || 100; // Use max allowed page size

  const response = await listAdminUsers({
    ...filters,
    page_size: Math.min(pageSize, 100), // Ensure we don't exceed backend limit
  });

  // Filter to only CTVET Staff roles (exclude SchoolAdmin)
  const filteredItems = response.items.filter(user => ctvetRoles.includes(user.role));

  // If there are more pages and we got filtered results, we need to fetch more
  // For now, we'll return what we have. Full implementation would require fetching all pages
  return {
    ...response,
    items: filteredItems,
    total: filteredItems.length,
    total_pages: Math.ceil(filteredItems.length / (filters?.page_size || 20)),
  };
}

export async function createAdminUser(data: AdminUserCreate): Promise<User> {
  const response = await fetchWithAuth("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

export async function updateAdminUser(userId: string, data: UserUpdate): Promise<User> {
  const response = await fetchWithAuth(`/api/v1/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  await handleResponse(response);
}

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

export async function updateExam(
  id: number,
  data: {
    exam_id_main_system?: number | null;
    exam_type?: string;
    exam_series?: string;
    year?: number;
    description?: string | null;
    pricing_model_preference?: string | null;
  }
): Promise<RegistrationExam> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<RegistrationExam>(response);
}

export async function deleteExam(id: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${id}`, {
    method: "DELETE",
  });
  await handleResponse(response);
}

// Pricing Management API
export async function getExamPricing(examId: number): Promise<ExamPricingResponse> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing`);
  return handleResponse<ExamPricingResponse>(response);
}

export async function getApplicationFee(
  examId: number,
  registrationType?: string | null
): Promise<ApplicationFeeResponse> {
  const params = new URLSearchParams();
  if (registrationType) {
    params.append("registration_type", registrationType);
  }
  const url = `/api/v1/admin/exams/${examId}/pricing/application-fee${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url);
  return handleResponse<ApplicationFeeResponse>(response);
}

export async function createOrUpdateApplicationFee(
  examId: number,
  feeData: ApplicationFeeCreate
): Promise<ApplicationFeeResponse> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/application-fee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feeData),
  });
  return handleResponse<ApplicationFeeResponse>(response);
}

export async function deleteApplicationFee(
  examId: number,
  registrationType?: string | null
): Promise<void> {
  const params = new URLSearchParams();
  if (registrationType) {
    params.append("registration_type", registrationType);
  }
  const url = `/api/v1/admin/exams/${examId}/pricing/application-fee${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function getPricingModels(examId: number): Promise<ExamPricingModelResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/models`);
  return handleResponse<ExamPricingModelResponse[]>(response);
}

export async function createOrUpdatePricingModel(
  examId: number,
  modelData: ExamPricingModelCreate
): Promise<ExamPricingModelResponse> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(modelData),
  });
  return handleResponse<ExamPricingModelResponse>(response);
}

export async function deletePricingModel(
  examId: number,
  registrationType?: string | null
): Promise<void> {
  const params = new URLSearchParams();
  if (registrationType) {
    params.append("registration_type", registrationType);
  }
  const url = `/api/v1/admin/exams/${examId}/pricing/models${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function getSubjectPricing(examId: number): Promise<SubjectPricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/subjects`);
  return handleResponse<SubjectPricingResponse[]>(response);
}

export async function createOrUpdateSubjectPricing(
  examId: number,
  pricingData: SubjectPricingBulkUpdate
): Promise<SubjectPricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/subjects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pricingData),
  });
  return handleResponse<SubjectPricingResponse[]>(response);
}

export async function deleteSubjectPricing(examId: number, subjectPricingId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/subjects/${subjectPricingId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function getTieredPricing(examId: number): Promise<TieredPricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/tiered`);
  return handleResponse<TieredPricingResponse[]>(response);
}

export async function createOrUpdateTieredPricing(
  examId: number,
  pricingData: TieredPricingBulkUpdate
): Promise<TieredPricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/tiered`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pricingData),
  });
  return handleResponse<TieredPricingResponse[]>(response);
}

export async function deleteTieredPricing(examId: number, tieredPricingId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/tiered/${tieredPricingId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function getProgrammePricing(examId: number): Promise<ProgrammePricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/programmes`);
  return handleResponse<ProgrammePricingResponse[]>(response);
}

export async function createOrUpdateProgrammePricing(
  examId: number,
  pricingData: ProgrammePricingBulkUpdate
): Promise<ProgrammePricingResponse[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/programmes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pricingData),
  });
  return handleResponse<ProgrammePricingResponse[]>(response);
}

export async function deleteProgrammePricing(examId: number, programmePricingId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/programmes/${programmePricingId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function downloadSubjectPricingTemplate(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/subjects/template`);
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function uploadSubjectPricing(examId: number, file: File): Promise<SubjectPricingResponse[]> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/subjects/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<SubjectPricingResponse[]>(response);
}

export async function downloadProgrammePricingTemplate(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/programmes/template`);
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function uploadProgrammePricing(examId: number, file: File): Promise<ProgrammePricingResponse[]> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/programmes/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ProgrammePricingResponse[]>(response);
}

export async function importExamPricing(
  examId: number,
  importData: ImportPricingRequest
): Promise<{ message: string; items_imported: number }> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/pricing/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(importData),
  });
  return handleResponse<{ message: string; items_imported: number }>(response);
}

export async function updateRegistrationPeriod(
  examId: number,
  data: {
    registration_start_date?: string;
    registration_end_date?: string;
    is_active?: boolean;
    allows_bulk_registration?: boolean;
    allows_private_registration?: boolean;
  }
): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/registration-period`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  await handleResponse(response);
}

export async function closeRegistrationPeriod(examId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/registration-period/close`, {
    method: "POST",
  });
  await handleResponse(response);
}

export async function generateIndexNumbers(examId: number, replaceExisting: boolean = false): Promise<{
  job_id: number;
  exam_id: number;
  message: string;
}> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/generate-index-numbers?replace_existing=${replaceExisting}`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function getIndexNumberGenerationStatus(examId: number, jobId: number): Promise<IndexNumberGenerationJob> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/generate-index-numbers/status/${jobId}`, {
    method: "GET",
  });
  return handleResponse<IndexNumberGenerationJob>(response);
}

export async function getLatestIndexNumberGenerationStatus(examId: number): Promise<IndexNumberGenerationJob | null> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/generate-index-numbers/status`, {
    method: "GET",
  });
  return handleResponse<IndexNumberGenerationJob | null>(response);
}

// Examination Schedule API
export async function listExaminationSchedules(examId: number): Promise<ExaminationSchedule[]> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules`);
  return handleResponse<ExaminationSchedule[]>(response);
}

export async function getExaminationSchedule(examId: number, scheduleId: number): Promise<ExaminationSchedule> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules/${scheduleId}`);
  return handleResponse<ExaminationSchedule>(response);
}

export async function createExaminationSchedule(examId: number, data: ExaminationScheduleCreate): Promise<ExaminationSchedule> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<ExaminationSchedule>(response);
}

export async function updateExaminationSchedule(
  examId: number,
  scheduleId: number,
  data: ExaminationScheduleUpdate
): Promise<ExaminationSchedule> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules/${scheduleId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<ExaminationSchedule>(response);
}

export async function deleteExaminationSchedule(examId: number, scheduleId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules/${scheduleId}`, {
    method: "DELETE",
  });
  await handleResponse(response);
}

export async function uploadSchedulesBulk(examId: number, file: File): Promise<ExaminationScheduleBulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules/bulk-upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ExaminationScheduleBulkUploadResponse>(response);
}

export async function downloadScheduleTemplate(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/schedules/template`);
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

// Timetable Download API
export async function downloadTimetableForExam(
  examId: number,
  subjectFilter: TimetableDownloadFilter = "ALL",
  mergeByDate: boolean = false,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<void> {
  const params = new URLSearchParams({ subject_filter: subjectFilter });
  if (mergeByDate) {
    params.append("merge_by_date", "true");
  }
  if (orientation === "landscape") {
    params.append("orientation", "landscape");
  }
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/timetable?${params}`);
  if (!response.ok) {
    await handleResponse(response);
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `timetable_exam_${examId}.pdf`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
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

export async function downloadTimetableForSchool(
  examId: number,
  schoolId: number,
  subjectFilter: TimetableDownloadFilter = "ALL",
  programmeId?: number,
  mergeByDate: boolean = false,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<void> {
  const params = new URLSearchParams({ subject_filter: subjectFilter });
  if (programmeId) {
    params.append("programme_id", programmeId.toString());
  }
  if (mergeByDate) {
    params.append("merge_by_date", "true");
  }
  if (orientation === "landscape") {
    params.append("orientation", "landscape");
  }
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/timetable/school/${schoolId}?${params}`);
  if (!response.ok) {
    await handleResponse(response);
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `timetable_exam_${examId}_school_${schoolId}.pdf`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
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

export async function downloadMySchoolTimetable(
  examId: number,
  subjectFilter: TimetableDownloadFilter = "ALL",
  programmeId?: number,
  mergeByDate: boolean = false,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<void> {
  const params = new URLSearchParams({ subject_filter: subjectFilter });
  if (programmeId) {
    params.append("programme_id", programmeId.toString());
  }
  if (mergeByDate) {
    params.append("merge_by_date", "true");
  }
  if (orientation === "landscape") {
    params.append("orientation", "landscape");
  }
  const response = await fetchWithAuth(`/api/v1/school/exams/${examId}/timetable?${params}`);
  if (!response.ok) {
    await handleResponse(response);
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `timetable_exam_${examId}.pdf`;
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
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

export async function getTimetablePreview(
  examId: number,
  subjectFilter: TimetableDownloadFilter = "ALL",
  programmeId?: number
): Promise<TimetableResponse> {
  const params = new URLSearchParams({ subject_filter: subjectFilter });
  if (programmeId) {
    params.append("programme_id", programmeId.toString());
  }
  const response = await fetchWithAuth(`/api/v1/school/exams/${examId}/timetable/preview?${params}`);
  return handleResponse<TimetableResponse>(response);
}

export async function getTimetablePreviewForSchool(
  examId: number,
  schoolId: number,
  subjectFilter: TimetableDownloadFilter = "ALL",
  programmeId?: number
): Promise<TimetableResponse> {
  const params = new URLSearchParams({ subject_filter: subjectFilter });
  if (programmeId) {
    params.append("programme_id", programmeId.toString());
  }
  const response = await fetchWithAuth(`/api/v1/admin/exams/${examId}/timetable/school/${schoolId}/preview?${params}`);
  return handleResponse<TimetableResponse>(response);
}

// Index Slip Download API
export async function downloadCandidateIndexSlip(candidateId: number): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/candidates/${candidateId}/index-slip`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function downloadMyIndexSlip(registrationId: number): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/private/registrations/${registrationId}/index-slip`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function listRegistrationInvoices(registrationId: number): Promise<Invoice[]> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/invoices`);
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.json();
}

export async function downloadInvoicePdf(invoiceId: number): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/private/invoices/${invoiceId}/pdf`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function downloadSchoolCandidateIndexSlip(candidateId: number): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/school/candidates/${candidateId}/index-slip`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    await handleResponse(response);
  }
  return response.blob();
}

export async function downloadIndexSlipsBulk(examId: number, programmeId?: number): Promise<void> {
  const params = new URLSearchParams();
  if (programmeId !== undefined) {
    params.append("programme_id", programmeId.toString());
  }
  const queryString = params.toString();
  const url = `/api/v1/school/exams/${examId}/index-slips/download${queryString ? `?${queryString}` : ""}`;

  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download ZIP" }));
    throw new Error(error.detail || "Failed to download index slips ZIP");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `index_slips_${examId}.zip`;
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

// Public candidate info API (no auth) - uses index_number
export async function getPublicCandidateInfo(indexNumber: string): Promise<{
  candidate_name: string;
  index_number: string;
  registration_number: string;
  center_name: string | null;
  center_code: string | null;
  photo_url: string | null;
  exam_type: string;
  exam_series: string;
  exam_year: number;
  schedule_entries: Array<{
    subject_code: string;
    subject_name: string;
    paper: number;
    date: string;
    start_time: string;
    end_time: string | null;
    venue: string | null;
  }>;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/public/candidates/${indexNumber}/info`);
  return handleResponse(response);
}

export async function exportCandidates(examId: number): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/exams/${examId}/candidates/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to export candidates" }));
    throw new Error((error as { detail?: string }).detail || "Failed to export candidates");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `exam_${examId}_candidates.xlsx`;
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
  const user = await handleResponse<User>(response);
  return transformUser(user);
}

export async function listSchoolUsers(): Promise<User[]> {
  const response = await fetchWithAuth("/api/v1/school/users");
  const users = await handleResponse<User[]>(response);
  return transformUsers(users);
}

export async function updateSchoolUser(userId: string, data: SchoolUserUpdate): Promise<User> {
  const response = await fetchWithAuth(`/api/v1/school/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  const user = await handleResponse<User>(response);
  return transformUser(user);
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

export async function approveCandidate(candidateId: number): Promise<RegistrationCandidate> {
  const response = await fetchWithAuth(`/api/v1/school/candidates/${candidateId}/approve`, {
    method: "POST",
  });
  return handleResponse<RegistrationCandidate>(response);
}

export async function listAvailableExams(): Promise<RegistrationExam[]> {
  const response = await fetchWithAuth("/api/v1/school/exams");
  return handleResponse<RegistrationExam[]>(response);
}

export async function listAllSchoolExams(): Promise<RegistrationExam[]> {
  const response = await fetchWithAuth("/api/v1/school/exams/all");
  return handleResponse<RegistrationExam[]>(response);
}

export async function listAllExams(): Promise<RegistrationExam[]> {
  const response = await fetchWithAuth("/api/v1/admin/exams");
  return handleResponse<RegistrationExam[]>(response);
}

export async function downloadRegistrationSummary(examId: number, programmeId?: number): Promise<void> {
  const params = new URLSearchParams();
  if (programmeId !== undefined) {
    params.append("programme_id", programmeId.toString());
  }
  const queryString = params.toString();
  const url = `/api/v1/school/exams/${examId}/candidates/summary.pdf${queryString ? `?${queryString}` : ""}`;

  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(error.detail || "Failed to download registration summary PDF");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `registration_summary_${examId}.pdf`;
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

export async function downloadRegistrationDetailed(examId: number, programmeId?: number): Promise<void> {
  const params = new URLSearchParams();
  if (programmeId !== undefined) {
    params.append("programme_id", programmeId.toString());
  }
  const queryString = params.toString();
  const url = `/api/v1/school/exams/${examId}/candidates/detailed.pdf${queryString ? `?${queryString}` : ""}`;

  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(error.detail || "Failed to download registration detailed PDF");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = `registration_detailed_${examId}.pdf`;
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

// School API - Programme Management
export async function listSchoolProgrammes(): Promise<Programme[]> {
  const response = await fetchWithAuth("/api/v1/school/programmes");
  return handleResponse<Programme[]>(response);
}

export async function listAvailableProgrammes(): Promise<Programme[]> {
  const response = await fetchWithAuth("/api/v1/school/programmes/available");
  return handleResponse<Programme[]>(response);
}

export async function getSchoolProgrammes(schoolId: number): Promise<Programme[]> {
  const response = await fetchWithAuth(`/api/v1/admin/schools/${schoolId}/programmes`);
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
  defaultChoiceGroupSelection?: Record<number, string>,
  registrationType?: string
): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_id", examId.toString());
  if (defaultChoiceGroupSelection) {
    formData.append("default_choice_group_selection", JSON.stringify(defaultChoiceGroupSelection));
  }
  if (registrationType) {
    formData.append("registration_type", registrationType);
  }

  const response = await fetchWithAuth("/api/v1/school/candidates/bulk", {
    method: "POST",
    body: formData,
  });
  return handleResponse<BulkUploadResponse>(response);
}

export async function downloadCandidateTemplate(examId?: number): Promise<Blob> {
  const url = examId
    ? `/api/v1/school/candidates/template?exam_id=${examId}`
    : "/api/v1/school/candidates/template";
  const response = await fetchWithAuth(url);
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

export async function listAllProgrammes(): Promise<Programme[]> {
  const allProgrammes: Programme[] = [];
  let page = 1;
  const pageSize = 100; // Backend max is 100

  while (true) {
    const response = await fetchWithAuth(`/api/v1/admin/programmes?page=${page}&page_size=${pageSize}`);
    const data = await handleResponse<ProgrammeListResponse>(response);
    allProgrammes.push(...data.items);

    // If we got fewer items than page size, we're done
    if (data.items.length < pageSize || page >= data.total_pages) {
      break;
    }
    page++;
  }

  return allProgrammes;
}

export async function listAllSubjects(): Promise<Subject[]> {
  const allSubjects: Subject[] = [];
  let page = 1;
  const pageSize = 100; // Backend max is 100

  while (true) {
    const response = await fetchWithAuth(`/api/v1/admin/subjects?page=${page}&page_size=${pageSize}`);
    const data = await handleResponse<SubjectListResponse>(response);
    allSubjects.push(...data.items);

    // If we got fewer items than page size, we're done
    if (data.items.length < pageSize || page >= data.total_pages) {
      break;
    }
    page++;
  }

  return allSubjects;
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

// Admin API - Photo Album
export async function getAdminPhotoAlbum(
  page: number = 1,
  pageSize: number = 10000,
  examId?: number,
  schoolId?: number,
  hasPhoto?: boolean
): Promise<PhotoAlbumResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (examId) params.append("exam_id", examId.toString());
  if (schoolId) params.append("school_id", schoolId.toString());
  if (hasPhoto !== undefined) params.append("has_photo", hasPhoto.toString());

  const response = await fetchWithAuth(`/api/v1/admin/candidates/photos/album?${params.toString()}`);
  return handleResponse<PhotoAlbumResponse>(response);
}

export async function exportCandidatePhotos(
  examId: number,
  schoolId?: number
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams();
  params.append("exam_id", examId.toString());
  if (schoolId) params.append("school_id", schoolId.toString());

  const response = await fetch(`${API_BASE_URL}/api/v1/admin/candidates/photos/export?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to export photos" }));
    throw new Error((error as { detail?: string }).detail || "Failed to export photos");
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get("Content-Disposition");
  let filename = "photos.zip";
  if (contentDisposition) {
    // Try multiple regex patterns to match filename
    // Pattern 1: filename="..." (quoted, most common)
    let filenameMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
    if (!filenameMatch) {
      // Pattern 2: filename='...' (single quotes)
      filenameMatch = contentDisposition.match(/filename\s*=\s*'([^']+)'/i);
    }
    if (!filenameMatch) {
      // Pattern 3: filename=... (unquoted, no spaces after =)
      filenameMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
    }
    if (!filenameMatch) {
      // Pattern 4: filename*=UTF-8''... (RFC 5987 encoded)
      filenameMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    }
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
      // Handle URL-encoded filenames (RFC 5987)
      if (filename.startsWith("UTF-8''")) {
        filename = decodeURIComponent(filename.substring(7));
      }
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

export async function getAdminPhotoFile(candidateId: number): Promise<string | null> {
  const response = await fetchWithAuth(`/api/v1/admin/candidates/${candidateId}/photos/file`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    await handleResponse(response);
    return null;
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
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

// Private user photo endpoints
export async function uploadPrivateCandidatePhoto(registrationId: number, file: File): Promise<RegistrationCandidatePhoto> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/photos`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<RegistrationCandidatePhoto>(response);
}

export async function getPrivateCandidatePhoto(registrationId: number): Promise<RegistrationCandidatePhoto | null> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/photos`);
  if (response.status === 404) {
    return null;
  }
  return handleResponse<RegistrationCandidatePhoto>(response);
}

export async function getPrivatePhotoFile(registrationId: number): Promise<string | null> {
  const response = await fetchWithAuth(`/api/v1/private/registrations/${registrationId}/photos/file`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    await handleResponse(response);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Results API
export async function publishResultsBulk(
  data: CandidateResultBulkPublish
): Promise<CandidateResultBulkPublishResponse> {
  const response = await fetchWithAuth("/api/v1/admin/results/publish", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<CandidateResultBulkPublishResponse>(response);
}

export async function uploadResultsBulk(
  examId: number,
  file: File
): Promise<CandidateResultBulkPublishResponse> {
  const formData = new FormData();
  formData.append("exam_id", examId.toString());
  formData.append("file", file);

  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/results/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to upload results" }));
    throw new Error((error as { detail?: string }).detail || "Failed to upload results");
  }

  return handleResponse<CandidateResultBulkPublishResponse>(response);
}

export async function publishResultsForExam(
  examId: number,
  schoolIds?: number[],
  subjectIds?: number[]
): Promise<CandidateResultBulkPublishResponse> {
  const body: { school_ids?: number[]; subject_ids?: number[] } = {};
  if (schoolIds && schoolIds.length > 0) body.school_ids = schoolIds;
  if (subjectIds && subjectIds.length > 0) body.subject_ids = subjectIds;

  const response = await fetchWithAuth(`/api/v1/admin/results/exams/${examId}/publish-results`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
  return handleResponse<CandidateResultBulkPublishResponse>(response);
}

export async function publishExamResults(examId: number): Promise<RegistrationExam> {
  const response = await fetchWithAuth(`/api/v1/admin/results/exams/${examId}/publish`, {
    method: "POST",
  });
  return handleResponse<RegistrationExam>(response);
}

export async function unpublishResultsForExam(
  examId: number,
  schoolIds?: number[],
  subjectIds?: number[]
): Promise<CandidateResultBulkPublishResponse> {
  const body: { school_ids?: number[]; subject_ids?: number[] } = {};
  if (schoolIds && schoolIds.length > 0) body.school_ids = schoolIds;
  if (subjectIds && subjectIds.length > 0) body.subject_ids = subjectIds;

  const response = await fetchWithAuth(`/api/v1/admin/results/exams/${examId}/unpublish-results`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
  return handleResponse<CandidateResultBulkPublishResponse>(response);
}

export async function unpublishExamResults(examId: number): Promise<RegistrationExam> {
  const response = await fetchWithAuth(`/api/v1/admin/results/exams/${examId}/unpublish`, {
    method: "POST",
  });
  return handleResponse<RegistrationExam>(response);
}

export async function listExamResults(
  examId: number,
  candidateId?: number,
  subjectId?: number,
  schoolId?: number
): Promise<CandidateResult[]> {
  const params = new URLSearchParams();
  if (candidateId) params.append("candidate_id", candidateId.toString());
  if (subjectId) params.append("subject_id", subjectId.toString());
  if (schoolId) params.append("school_id", schoolId.toString());

  const response = await fetchWithAuth(
    `/api/v1/admin/results/${examId}${params.toString() ? `?${params.toString()}` : ""}`
  );
  return handleResponse<CandidateResult[]>(response);
}

export async function updateResult(
  resultId: number,
  grade: string
): Promise<CandidateResult> {
  const response = await fetchWithAuth(`/api/v1/admin/results/${resultId}`, {
    method: "PUT",
    body: JSON.stringify({ grade }),
  });
  return handleResponse<CandidateResult>(response);
}

export async function createResultBlock(data: ResultBlockCreate): Promise<ResultBlock> {
  const response = await fetchWithAuth("/api/v1/admin/results/blocks", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<ResultBlock>(response);
}

export async function listResultBlocks(
  examId?: number,
  isActive?: boolean
): Promise<ResultBlock[]> {
  const params = new URLSearchParams();
  // Only add exam_id if it's a valid number (not null, undefined, or NaN)
  const shouldAddExamId = examId !== undefined && examId !== null && !isNaN(examId) && examId > 0;
  if (shouldAddExamId) {
    params.append("exam_id", examId.toString());
  }
  if (isActive !== undefined) params.append("is_active", isActive.toString());

  const url = `/api/v1/admin/results/blocks${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url);
  return handleResponse<ResultBlock[]>(response);
}

export async function deleteResultBlock(blockId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/results/blocks/${blockId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse(response);
  }
}

export async function checkPublicResults(
  data: PublicResultCheckRequest
): Promise<PublicResultResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/results/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return handleResponse<PublicResultResponse>(response);
}

export async function generateResultsPDF(
  data: PublicResultCheckRequest
): Promise<Blob> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/results/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to generate PDF" }));
    throw new Error(error.detail || `Failed to generate PDF: ${response.statusText}`);
  }

  return response.blob();
}

// Certificate Request API Functions

// Admin Certificate Request Management
export interface CertificateRequestListResponse {
  items: CertificateRequestResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export async function listCertificateRequests(
  statusFilter?: string,
  statusMin?: string,
  requestType?: string,
  assignedTo?: string,
  priority?: string,
  serviceType?: string,
  view?: "active" | "completed" | "cancelled" | "all" | "my_tickets",
  includeBulkConfirmations: boolean = false,
  page: number = 1,
  pageSize: number = 20
): Promise<CertificateRequestListResponse> {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter.trim() !== "") {
    params.append("status_filter", statusFilter);
  }
  if (statusMin && statusMin.trim() !== "") {
    params.append("status_min", statusMin);
  }
  if (requestType && requestType.trim() !== "") {
    params.append("request_type", requestType);
  }
  if (assignedTo && assignedTo.trim() !== "") {
    params.append("assigned_to", assignedTo);
  }
  if (priority && priority.trim() !== "") {
    params.append("priority", priority);
  }
  if (serviceType && serviceType.trim() !== "") {
    params.append("service_type", serviceType);
  }
  if (view && view !== "all") {
    params.append("view", view);
  }
  if (includeBulkConfirmations) {
    params.append("include_bulk_confirmations", "true");
  }
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    }
  );
  return handleResponse<CertificateRequestListResponse>(response);
}

export async function getCertificateRequestById(requestId: number): Promise<CertificateRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  return handleResponse<CertificateRequestResponse>(response);
}

export async function beginCertificateRequestProcess(requestId: number): Promise<CertificateRequestResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/begin-process`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<CertificateRequestResponse>(response);
}

export async function beginCertificateConfirmationProcess(
  confirmationId: number
): Promise<CertificateConfirmationRequestResponse> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/begin-process`,
    { method: "POST" }
  );
  return handleResponse<CertificateConfirmationRequestResponse>(response);
}

export async function sendCertificateRequestToDispatch(requestId: number): Promise<CertificateRequestResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/send-to-dispatch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<CertificateRequestResponse>(response);
}

export async function sendCertificateConfirmationToDispatch(
  confirmationId: number
): Promise<CertificateConfirmationRequestResponse> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/send-to-dispatch`,
    { method: "POST" }
  );
  return handleResponse<CertificateConfirmationRequestResponse>(response);
}

export async function dispatchRequest(
  requestId: number,
  trackingNumber?: string
): Promise<CertificateRequestResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/dispatch/certificate-requests/${requestId}/dispatch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tracking_number: trackingNumber || undefined }),
    }
  );
  return handleResponse<CertificateRequestResponse>(response);
}

export async function updateCertificateRequest(
  requestId: number,
  updateData: {
    notes?: string;
    tracking_number?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    assigned_to_user_id?: string | null;
  }
): Promise<CertificateRequestResponse | CertificateConfirmationRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });
  return handleResponse<CertificateRequestResponse | CertificateConfirmationRequestResponse>(response);
}

export async function getCertificateRequestStatistics(options?: {
  period?: "last_week" | "last_month" | "last_year" | "custom";
  startDate?: string;
  endDate?: string;
}): Promise<{
  total: number;
  pending_payment: number;
  completed: number;
}> {
  const params = new URLSearchParams();
  if (options?.period) {
    params.append("period", options.period);
  }
  if (options?.startDate) {
    params.append("start_date", options.startDate);
  }
  if (options?.endDate) {
    params.append("end_date", options.endDate);
  }

  const url = `${API_BASE_URL}/api/v1/admin/certificate-requests/statistics${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  return handleResponse(response);
}

export async function downloadCertificateRequestPDF(requestId: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/pdf`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(error.detail || "Failed to download PDF");
  }
  return response.blob();
}

export interface CertificateRequestCreate {
  request_type: "certificate" | "attestation" | "confirmation" | "verification";
  index_number: string;
  exam_year: number;
  examination_series: "MAY/JUNE" | "NOV/DEC";  // Required for certificate/attestation
  examination_center_id?: number;  // Optional for confirmation/verification
  national_id_number?: string;  // Optional for confirmation/verification
  delivery_method?: "pickup" | "courier";  // Optional for confirmation/verification
  contact_phone: string;
  contact_email?: string;
  courier_address_line1?: string;
  courier_address_line2?: string;
  courier_city?: string;
  courier_region?: string;
  courier_postal_code?: string;
  service_type?: "standard" | "express";
  // Confirmation/Verification specific fields
  candidate_name?: string;
  candidate_index_number?: string;
  school_name?: string;
  programme_name?: string;
  completion_year?: number;
  certificate_file_path?: string;
  candidate_photograph_file_path?: string;
  request_details?: string;
}

export interface BulkCertificateRequestItem {
  index_number?: string;  // Optional, can use candidate_index_number
  candidate_index_number?: string;
  exam_year?: number;  // Optional, can use completion_year
  completion_year?: number;
  candidate_name: string;
  school_name: string;
  programme_name: string;
  request_details?: string;
  certificate_file?: File;  // Optional certificate scan
  candidate_photo_file?: File;  // Optional candidate photo
}

export interface BulkCertificateRequestCreate {
  request_type: "confirmation" | "verification";
  requests: BulkCertificateRequestItem[];
  contact_phone: string;
  contact_email?: string;
  service_type?: "standard" | "express";
}

export interface CertificateRequestResponse {
  id: number;
  request_type: "certificate" | "attestation" | "confirmation" | "verification";
  request_number: string;
  index_number: string;
  exam_year: number;
  examination_series: "MAY/JUNE" | "NOV/DEC";
  examination_center_id?: number | null;
  examination_center_name?: string;
  national_id_number?: string | null;
  delivery_method?: "pickup" | "courier" | null;
  contact_phone: string;
  contact_email?: string;
  status: string;
  invoice_id?: number;
  payment_id?: number;
  tracking_number?: string;
  assigned_to_user_id?: string;
  priority: "low" | "medium" | "high" | "urgent";
  service_type: "standard" | "express";
  paid_at?: string;
  in_process_at?: string;
  ready_for_dispatch_at?: string;
  received_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // Confirmation/Verification specific fields
  candidate_name?: string;
  candidate_index_number?: string;
  school_name?: string;
  programme_name?: string;
  completion_year?: number;
  certificate_file_path?: string;
  candidate_photograph_file_path?: string;
  request_details?: string;
}

export interface PaymentInitializeResponse {
  payment_id: number;
  authorization_url: string;
  paystack_reference: string;
}

export async function submitCertificateRequest(
  data: CertificateRequestCreate,
  photograph?: File,
  nationalIdScan?: File,
  certificate?: File,
  candidatePhotograph?: File
): Promise<CertificateRequestResponse> {
  // For certificate/attestation requests, photograph and nationalIdScan are required
  if (data.request_type === "certificate" || data.request_type === "attestation") {
    if (!photograph) {
      throw new Error("Photograph is required for certificate and attestation requests");
    }
    if (!nationalIdScan) {
      throw new Error("National ID scan is required for certificate and attestation requests");
    }
  }
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const formData = new FormData();

  formData.append("request_type", data.request_type);
  formData.append("index_number", data.index_number);
  formData.append("exam_year", data.exam_year.toString());
  if (data.examination_series) {
    formData.append("examination_series", data.examination_series);
  }
  if (data.examination_center_id !== undefined) {
    formData.append("examination_center_id", data.examination_center_id.toString());
  }
  if (data.national_id_number) {
    formData.append("national_id_number", data.national_id_number);
  }
  if (data.delivery_method) {
    formData.append("delivery_method", data.delivery_method);
  }
  formData.append("contact_phone", data.contact_phone);
  if (data.contact_email) formData.append("contact_email", data.contact_email);
  if (data.courier_address_line1) formData.append("courier_address_line1", data.courier_address_line1);
  if (data.courier_address_line2) formData.append("courier_address_line2", data.courier_address_line2);
  if (data.courier_city) formData.append("courier_city", data.courier_city);
  if (data.courier_region) formData.append("courier_region", data.courier_region);
  if (data.courier_postal_code) formData.append("courier_postal_code", data.courier_postal_code);
  formData.append("service_type", data.service_type || "standard");

  // Confirmation/Verification specific fields
  if (data.candidate_name) formData.append("candidate_name", data.candidate_name);
  if (data.candidate_index_number) formData.append("candidate_index_number", data.candidate_index_number);
  if (data.school_name) formData.append("school_name", data.school_name);
  if (data.programme_name) formData.append("programme_name", data.programme_name);
  if (data.completion_year) formData.append("completion_year", data.completion_year.toString());
  if (data.request_details) formData.append("request_details", data.request_details);

  // File uploads - ensure files are always appended if provided
  // Use the exact field names expected by the backend: "photograph" and "national_id_scan"
  if (photograph) {
    if (!(photograph instanceof File)) {
      throw new Error("Photograph must be a File object");
    }
    formData.append("photograph", photograph, photograph.name);
  } else {
    throw new Error("Photograph file is required");
  }

  if (nationalIdScan) {
    if (!(nationalIdScan instanceof File)) {
      throw new Error("National ID scan must be a File object");
    }
    formData.append("national_id_scan", nationalIdScan, nationalIdScan.name);
  } else {
    throw new Error("National ID scan file is required");
  }

  if (certificate) formData.append("certificate", certificate);
  if (candidatePhotograph) formData.append("candidate_photograph", candidatePhotograph);

  // Include auth header if user is logged in
  // IMPORTANT: Do NOT set Content-Type header - browser must set it automatically with boundary for FormData
  const headers: HeadersInit = {};
  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/public/certificate-requests`, {
    method: "POST",
    headers, // No Content-Type - browser will set multipart/form-data with boundary
    body: formData,
  });

  return handleResponse<CertificateRequestResponse>(response);
}

export async function submitBulkCertificateRequest(
  data: BulkCertificateRequestCreate
): Promise<{
  bulk_request_number: string;
  bulk_request_id: number;
  total_amount: number;
  invoice_number: string | null;
  success: number;
  failed: number;
  individual_requests: Array<{ index: number; request_number: string; request_id: number }>;
  errors: Array<{ index: number; error: string }>;
}> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

  // Create FormData for multipart/form-data request
  const formData = new FormData();

  // Add form fields
  formData.append("request_type", data.request_type);
  formData.append("contact_phone", data.contact_phone);
  if (data.contact_email) {
    formData.append("contact_email", data.contact_email);
  }
  if (data.service_type) {
    formData.append("service_type", data.service_type);
  }

  // Add requests as JSON string
  const requestsData = data.requests.map((r) => ({
    candidate_name: r.candidate_name,
    candidate_index_number: r.candidate_index_number || r.index_number || "",
    completion_year: r.completion_year || r.exam_year || new Date().getFullYear(),
    school_name: r.school_name,
    programme_name: r.programme_name,
    request_details: r.request_details || "",
  }));
  formData.append("requests_json", JSON.stringify(requestsData));

  // Add files with indexed names
  data.requests.forEach((req, index) => {
    if (req.certificate_file) {
      formData.append(`certificate_${index}`, req.certificate_file);
    }
    if (req.candidate_photo_file) {
      formData.append(`candidate_photo_${index}`, req.candidate_photo_file);
    }
  });

  // Include auth header if user is logged in
  const headers: HeadersInit = {};
  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Don't set Content-Type header - browser will set it with boundary for FormData

  const response = await fetch(`${API_BASE_URL}/api/v1/public/certificate-requests/bulk`, {
    method: "POST",
    headers,
    body: formData,
  });

  return handleResponse(response);
}

// Bulk Certificate Confirmation Types and Functions

export interface CertificateConfirmationRequestResponse {
  id: number;
  request_number: string;
  request_type: "confirmation" | "verification";
  contact_phone: string;
  contact_email?: string | null;
  certificate_details: Array<{
    candidate_name: string;
    candidate_index_number?: string | null;
    school_name: string;
    programme_name: string;
    completion_year: number;
    certificate_file_path?: string | null;
    candidate_photograph_file_path?: string | null;
    request_details?: string | null;
  }>;
  pdf_file_path?: string | null;
  pdf_generated_at?: string | null;
  pdf_generated_by_user_id?: string | null;
  // Response metadata
  response_file_path?: string | null;
  response_file_name?: string | null;
  response_mime_type?: string | null;
  response_source?: string | null; // "upload" | "template"
  response_reference_number?: string | null; // Reference number for the response letter (separate from request_number)
  responded_at?: string | null;
  responded_by_user_id?: string | null;
  response_notes?: string | null;
  response_payload?: Record<string, any> | null;
  has_response?: boolean;
  response_signed?: boolean;
  response_signed_at?: string | null;
  response_signed_by_user_id?: string | null;
  response_revoked?: boolean;
  response_revoked_at?: string | null;
  response_revoked_by_user_id?: string | null;
  response_revocation_reason?: string | null;
  invoice_id?: number | null;
  payment_id?: number | null;
  status: string;
  priority: string;
  service_type: string;
  assigned_to_user_id?: string | null;
  processed_by_user_id?: string | null;
  dispatched_by_user_id?: string | null;
  dispatched_at?: string | null;
  tracking_number?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  in_process_at?: string | null;
  ready_for_dispatch_at?: string | null;
  received_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  invoice?: any;
  payment?: any;
}

export interface BulkCertificateConfirmationResponse {
  id: number;
  bulk_request_number: string;
  request_type: "confirmation" | "verification";
  contact_phone: string;
  contact_email?: string | null;
  service_type: "standard" | "express";
  status: string;
  total_amount: number;
  certificate_details?: Array<{
    candidate_name: string;
    candidate_index_number?: string;
    school_name: string;
    programme_name: string;
    completion_year: number;
    certificate_file_path?: string;
    candidate_photograph_file_path?: string;
    request_details?: string;
  }>;
  pdf_file_path?: string | null;
  pdf_generated_at?: string | null;
  pdf_generated_by_user_id?: string | null;
  response_file_path?: string | null;
  response_file_name?: string | null;
  response_source?: string | null;
  responded_at?: string | null;
  has_response?: boolean;
  response_signed?: boolean;
  response_signed_at?: string | null;
  response_revoked?: boolean;
  response_revoked_at?: string | null;
  response_revoked_by_user_id?: string | null;
  response_revocation_reason?: string | null;
  invoice_id?: number | null;
  payment_id?: number | null;
  assigned_to_user_id?: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  processed_by_user_id?: string | null;
  dispatched_by_user_id?: string | null;
  dispatched_at?: string | null;
  tracking_number?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  in_process_at?: string | null;
  ready_for_dispatch_at?: string | null;
  received_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  individual_requests?: CertificateConfirmationRequestResponse[];
  invoice?: any;
  payment?: any;
  _type?: "bulk_confirmation";  // To distinguish from regular requests
}

export async function getCertificateConfirmation(
  confirmationId: number
): Promise<CertificateConfirmationRequestResponse> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}`
  );
  return handleResponse<CertificateConfirmationRequestResponse>(response);
}

// Keep for backward compatibility but redirect to new function
export async function getBulkCertificateConfirmation(
  bulkConfirmationId: number
): Promise<CertificateConfirmationRequestResponse> {
  return getCertificateConfirmation(bulkConfirmationId);
}

export async function listBulkCertificateConfirmations(): Promise<BulkCertificateConfirmationResponse[]> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-requests?include_bulk_confirmations=true`
  );
  const data = await handleResponse<{ items: BulkCertificateConfirmationResponse[] }>(response);
  return data.items.filter((item: any) => item._type === "bulk_confirmation");
}

export async function generateBulkConfirmationPDF(
  confirmationId: number
): Promise<{ message: string; file_path: string; pdf_generated_at: string | null }> {
  // Use the unified endpoint (works for both single and bulk confirmations)
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/generate-pdf`,
    {
      method: "POST",
    }
  );
  return handleResponse(response);
}

export async function uploadBulkConfirmationPDF(
  confirmationId: number,
  pdfFile: File
): Promise<{ message: string; file_path: string; pdf_generated_at: string | null }> {
  const formData = new FormData();
  formData.append("pdf_file", pdfFile);

  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/upload-pdf`,
    {
      method: "POST",
      body: formData,
    }
  );
  return handleResponse(response);
}

export async function downloadBulkConfirmationPDF(confirmationId: number): Promise<Blob> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/pdf`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(error.detail || "Failed to download PDF");
  }
  return response.blob();
}

export async function downloadBulkConfirmationPDFPublic(bulkRequestNumber: string): Promise<Blob> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(
    `${API_BASE_URL}/api/v1/public/certificate-confirmations/bulk/${bulkRequestNumber}/pdf`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(error.detail || "Failed to download PDF");
  }
  return response.blob();
}

export async function downloadConfirmationResponsePublic(requestNumber: string): Promise<Blob> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/private/certificate-confirmations/request/${requestNumber}/response`,
    {
      headers: token ? {
        Authorization: `Bearer ${token}`,
      } : {},
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download response" }));
    throw new Error(error.detail || "Failed to download response");
  }
  return response.blob();
}

export async function previewConfirmationResponsePublic(requestNumber: string): Promise<string> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/private/certificate-confirmations/request/${requestNumber}/response`,
    {
      headers: token ? {
        Authorization: `Bearer ${token}`,
      } : {},
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to preview response" }));
    throw new Error(error.detail || "Failed to preview response");
  }
  const blob = await response.blob();
  return window.URL.createObjectURL(blob);
}

// Response management functions
export async function uploadConfirmationResponse(
  confirmationId: number,
  file: File,
  notes?: string
): Promise<{ message: string; confirmation_id: number; request_number: string; response_file_name?: string; responded_at?: string }> {
  const formData = new FormData();
  formData.append("response_file", file);
  if (notes) {
    formData.append("response_notes", notes);
  }

  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response/upload`,
    {
      method: "POST",
      body: formData,
    }
  );
  return handleResponse(response);
}

export async function generateConfirmationResponse(
  confirmationId: number,
  payload: {
    letter?: {
      subject?: string;
      /** Body content in HTML format (rich text) or plain text (for backward compatibility) */
      body?: string;
      remarks?: string;
      signatory_name?: string;
      signatory_title?: string;
    };
    outcomes?: Record<string, { status?: string; remarks?: string }>;
    /** Reference number for the response. Defaults to the request number if not provided. */
    reference_number?: string;
  }
): Promise<{ message: string; confirmation_id: number; request_number: string; response_file_name?: string; responded_at?: string }> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return handleResponse(response);
}

export async function downloadConfirmationResponse(confirmationId: number): Promise<Blob> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download response" }));
    throw new Error(error.detail || "Failed to download response");
  }
  return response.blob();
}

export async function downloadConfirmationRequestPDF(confirmationId: number): Promise<Blob> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/details.pdf`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download request PDF" }));
    throw new Error(error.detail || "Failed to download request PDF");
  }
  return response.blob();
}

export async function signConfirmationResponse(
  confirmationId: number
): Promise<{ message: string; confirmation_id: number; request_number: string; response_signed: boolean; response_signed_at?: string; response_signed_by_user_id?: string }> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response/sign`,
    {
      method: "POST",
    }
  );
  return handleResponse(response);
}

export async function revokeConfirmationResponse(
  confirmationId: number,
  revocationReason: string
): Promise<{ message: string; confirmation_id: number; request_number: string; response_revoked: boolean; response_revoked_at?: string; response_revoked_by_user_id?: string; response_revocation_reason?: string }> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response/revoke`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ revocation_reason: revocationReason }),
    }
  );
  return handleResponse(response);
}

export async function unrevokeConfirmationResponse(
  confirmationId: number
): Promise<{ message: string; confirmation_id: number; request_number: string; response_revoked: boolean }> {
  const response = await fetchWithAuth(
    `/api/v1/admin/certificate-confirmations/${confirmationId}/response/unrevoke`,
    {
      method: "POST",
    }
  );
  return handleResponse(response);
}

export async function getCertificateRequestStatus(requestNumber: string): Promise<any> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/certificate-requests/${requestNumber}`);
  return handleResponse(response);
}

export async function listMyCertificateRequests(
  requestType?: "confirmation" | "verification",
  statusFilter?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<CertificateRequestListResponse> {
  const params = new URLSearchParams();
  if (requestType) params.append("request_type", requestType);
  if (statusFilter) params.append("status_filter", statusFilter);
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());

  // fetchWithAuth already prepends API_BASE_URL, so just pass the path
  const response = await fetchWithAuth(`/api/v1/private/certificate-requests?${params.toString()}`);
  return handleResponse<CertificateRequestListResponse>(response);
}

export async function initializePayment(requestNumber: string): Promise<PaymentInitializeResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/certificate-requests/${requestNumber}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  return handleResponse<PaymentInitializeResponse>(response);
}

export async function downloadInvoice(requestNumber: string): Promise<Blob> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/certificate-requests/${requestNumber}/invoice`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || `Failed to download invoice: ${response.statusText}`);
  }

  return response.blob();
}

// Ticket Management Interfaces
export interface TicketActivityResponse {
  id: number;
  ticket_id: number;
  activity_type: "comment" | "status_change" | "assignment" | "note" | "system";
  user_id?: string;
  user_name?: string;
  old_status?: string;
  new_status?: string;
  old_assigned_to?: string;
  new_assigned_to?: string;
  comment?: string;
  created_at: string;
}

export interface TicketStatusHistoryResponse {
  id: number;
  ticket_id: number;
  from_status?: string;
  to_status: string;
  changed_by_user_id?: string;
  changed_by_name?: string;
  reason?: string;
  created_at: string;
}

export interface TicketAssignmentRequest {
  assigned_to_user_id: string;
}

export interface TicketCommentRequest {
  comment: string;
}

// Ticket Management API Functions
export async function assignTicket(
  requestId: number,
  assignmentData: TicketAssignmentRequest
): Promise<CertificateRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/assign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(assignmentData),
  });
  return handleResponse<CertificateRequestResponse>(response);
}

export async function unassignTicket(requestId: number): Promise<CertificateRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/unassign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return handleResponse<CertificateRequestResponse>(response);
}

export async function addTicketComment(
  requestId: number,
  commentData: TicketCommentRequest
): Promise<TicketActivityResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commentData),
  });
  return handleResponse<TicketActivityResponse>(response);
}

export async function getTicketActivities(
  requestId: number,
  limit: number = 100,
  ticketType?: "certificate_request" | "certificate_confirmation_request"
): Promise<{ items: TicketActivityResponse[]; total: number }> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const params = new URLSearchParams({ limit: limit.toString() });
  if (ticketType) {
    params.append("ticket_type", ticketType);
  }
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/activities?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<{ items: TicketActivityResponse[]; total: number }>(response);
}

export async function getTicketStatusHistory(
  requestId: number,
  limit: number = 100
): Promise<{ items: TicketStatusHistoryResponse[]; total: number }> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/status-history?limit=${limit}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<{ items: TicketStatusHistoryResponse[]; total: number }>(response);
}

// Status change API functions
export async function markRequestReceived(requestId: number): Promise<CertificateRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/dispatch/certificate-requests/${requestId}/mark-received`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<CertificateRequestResponse>(response);
}

export async function completeRequest(requestId: number): Promise<CertificateRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/dispatch/certificate-requests/${requestId}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<CertificateRequestResponse>(response);
}

export async function cancelRequest(
  requestId: number,
  reason?: string
): Promise<CertificateRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: reason || undefined }),
  });
  return handleResponse<CertificateRequestResponse>(response);
}

export async function changeTicketStatusManual(
  ticketId: number,
  newStatus: "in_process" | "ready_for_dispatch" | "dispatched" | "received" | "completed",
  reason: string,
  ticketType?: "certificate_request" | "certificate_confirmation_request"
): Promise<CertificateRequestResponse | CertificateConfirmationRequestResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/api/v1/admin/tickets/${ticketId}/manual-status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      new_status: newStatus,
      reason,
      ticket_type: ticketType,
    }),
  });
  return handleResponse(response);
}

export async function resendPaymentLink(requestId: number): Promise<PaymentInitializeResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE_URL}/api/v1/admin/certificate-requests/${requestId}/resend-payment-link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return handleResponse<PaymentInitializeResponse>(response);
}

// Payment Reconciliation Types and Functions

export interface PaymentReconciliationResponse {
  message: string;
  payment_id: number;
  status: string;
  paid_at?: string | null;
  paystack_status?: string;
}

export interface PendingPayment {
  payment_id: number;
  paystack_reference: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  request_number: string | null;
  request_type: string | null;
  invoice_id: number | null;
  invoice_status: string | null;
}

export interface PendingPaymentsResponse {
  count: number;
  payments: PendingPayment[];
  cutoff_time: string;
}

export async function reconcilePayment(paymentId: number): Promise<PaymentReconciliationResponse> {
  const response = await fetchWithAuth(
    `/api/v1/admin/payments/${paymentId}/reconcile`,
    {
      method: "POST",
    }
  );
  return handleResponse<PaymentReconciliationResponse>(response);
}

export async function reconcilePaymentByReference(reference: string): Promise<PaymentReconciliationResponse> {
  const params = new URLSearchParams();
  params.append("reference", reference);
  const response = await fetchWithAuth(
    `/api/v1/admin/payments/reconcile-by-reference?${params.toString()}`,
    {
      method: "POST",
    }
  );
  return handleResponse<PaymentReconciliationResponse>(response);
}

export async function listPendingPayments(hours: number = 24): Promise<PendingPaymentsResponse> {
  const params = new URLSearchParams();
  params.append("hours", hours.toString());
  const response = await fetchWithAuth(
    `/api/v1/admin/payments/pending-reconciliation?${params.toString()}`
  );
  return handleResponse<PendingPaymentsResponse>(response);
}

// API Key functions
export async function createApiKey(data: { name: string; rate_limit_per_minute?: number }): Promise<ApiKeyCreateResponse> {
  const response = await fetchWithAuth(`/api/v1/api-keys`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<ApiKeyCreateResponse>(response);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const response = await fetchWithAuth(`/api/v1/api-keys`);
  return handleResponse<ApiKey[]>(response);
}

export async function getApiKey(keyId: string): Promise<ApiKey> {
  const response = await fetchWithAuth(`/api/v1/api-keys/${keyId}`);
  return handleResponse<ApiKey>(response);
}

export async function getApiKeyUsage(keyId: string): Promise<ApiKeyUsageStats> {
  const response = await fetchWithAuth(`/api/v1/api-keys/${keyId}/usage`);
  return handleResponse<ApiKeyUsageStats>(response);
}

export async function updateApiKey(
  keyId: string,
  data: { name?: string; rate_limit_per_minute?: number; is_active?: boolean }
): Promise<ApiKey> {
  const response = await fetchWithAuth(`/api/v1/api-keys/${keyId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return handleResponse<ApiKey>(response);
}

export async function deleteApiKey(keyId: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/api-keys/${keyId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete API key: ${response.statusText}`);
  }
}

// Credit functions
export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await fetchWithAuth(`/api/v1/credits/balance`);
  return handleResponse<CreditBalance>(response);
}

export async function getCreditTransactions(page: number = 1, pageSize: number = 20): Promise<CreditTransactionListResponse> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("page_size", pageSize.toString());
  const response = await fetchWithAuth(`/api/v1/credits/transactions?${params.toString()}`);
  return handleResponse<CreditTransactionListResponse>(response);
}

export async function purchaseCredits(data: CreditPurchaseRequest): Promise<CreditPurchaseResponse> {
  const response = await fetchWithAuth(`/api/v1/credits/purchase`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<CreditPurchaseResponse>(response);
}

// Verification functions (dashboard)
export async function verifyCandidate(data: PublicResultCheckRequest): Promise<PublicResultResponse> {
  const response = await fetchWithAuth(`/api/v1/dashboard/verify`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<PublicResultResponse>(response);
}

export async function verifyCandidatesBulk(data: BulkVerificationRequest): Promise<BulkVerificationResponse> {
  const response = await fetchWithAuth(`/api/v1/dashboard/verify`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<BulkVerificationResponse>(response);
}

// API User Management functions (admin only)
export async function listApiUsers(filters: {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
}): Promise<ApiUserListResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.page_size) params.append("page_size", filters.page_size.toString());
  if (filters.search) params.append("search", filters.search);
  if (filters.is_active !== undefined) params.append("is_active", filters.is_active.toString());
  const response = await fetchWithAuth(`/api/v1/admin/api-users?${params.toString()}`);
  return handleResponse<ApiUserListResponse>(response);
}

export async function getApiUser(userId: string): Promise<ApiUserDetail> {
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}`);
  return handleResponse<ApiUserDetail>(response);
}

export async function createApiUser(data: { email: string; password: string; full_name: string }): Promise<ApiUser> {
  const response = await fetchWithAuth(`/api/v1/admin/api-users`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<ApiUser>(response);
}

export async function updateApiUser(userId: string, data: { full_name?: string; is_active?: boolean; password?: string }): Promise<ApiUser> {
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return handleResponse<ApiUser>(response);
}

export async function deactivateApiUser(userId: string, revokeKeys: boolean = false): Promise<void> {
  const params = new URLSearchParams();
  if (revokeKeys) params.append("revoke_keys", "true");
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}?${params.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to deactivate API user: ${response.statusText}`);
  }
}

export async function getApiUserUsage(userId: string, startDate?: string, endDate?: string): Promise<ApiUserUsageStats> {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}/usage?${params.toString()}`);
  return handleResponse<ApiUserUsageStats>(response);
}

export async function getApiUserApiKeys(userId: string): Promise<ApiKey[]> {
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}/api-keys`);
  return handleResponse<ApiKey[]>(response);
}

export async function assignCreditsToApiUser(userId: string, amount: number, description?: string): Promise<CreditBalance> {
  const response = await fetchWithAuth(`/api/v1/admin/api-users/${userId}/credits`, {
    method: "POST",
    body: JSON.stringify({ amount, description }),
  });
  return handleResponse<CreditBalance>(response);
}

// Invoice Generation APIs

// School Admin Invoice APIs
export async function getFreeTvetInvoiceByExamination(examId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/school/invoices/free-tvet/by-examination?exam_id=${examId}`);
  return handleResponse<any>(response);
}

export async function getFreeTvetInvoiceByExaminationGroupedByProgramme(examId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/school/invoices/free-tvet/by-examination-grouped-by-programme?exam_id=${examId}`);
  return handleResponse<any>(response);
}

export async function getReferralInvoiceByExamination(examId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/school/invoices/referral/by-examination?exam_id=${examId}`);
  return handleResponse<any>(response);
}

export async function downloadFreeTvetInvoicePdf(examId: number, groupByProgramme: boolean = false): Promise<Blob> {
  const params = new URLSearchParams();
  params.append("exam_id", examId.toString());
  if (groupByProgramme) {
    params.append("group_by_programme", "true");
  }
  const response = await fetchWithAuth(`/api/v1/school/invoices/free-tvet/pdf?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}

export async function downloadReferralInvoicePdf(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/school/invoices/referral/pdf?exam_id=${examId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}

// System Admin Invoice APIs
export async function getAdminFreeTvetInvoiceBySchool(examId: number, schoolId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/free-tvet/by-school?exam_id=${examId}&school_id=${schoolId}`);
  return handleResponse<any>(response);
}

export async function getAdminReferralInvoiceBySchool(examId: number, schoolId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/referral/by-school?exam_id=${examId}&school_id=${schoolId}`);
  return handleResponse<any>(response);
}

export async function getAdminFreeTvetInvoiceSummary(examId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/free-tvet/summary?exam_id=${examId}`);
  return handleResponse<any>(response);
}

export async function getAdminReferralInvoiceSummary(examId: number): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/referral/summary?exam_id=${examId}`);
  return handleResponse<any>(response);
}

export async function downloadAdminFreeTvetInvoicePdfBySchool(examId: number, schoolId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/free-tvet/by-school/pdf?exam_id=${examId}&school_id=${schoolId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}

export async function downloadAdminReferralInvoicePdfBySchool(examId: number, schoolId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/referral/by-school/pdf?exam_id=${examId}&school_id=${schoolId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}

export async function downloadAdminFreeTvetInvoiceSummaryPdf(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/free-tvet/summary/pdf?exam_id=${examId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}

export async function downloadAdminReferralInvoiceSummaryPdf(examId: number): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/admin/invoices/referral/summary/pdf?exam_id=${examId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to download invoice" }));
    throw new Error(error.detail || "Failed to download invoice");
  }
  return response.blob();
}
