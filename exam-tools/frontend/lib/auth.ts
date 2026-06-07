const TOKEN_KEY = "exam_tools_access_token";

export function getApiBaseUrl(): string {
  const envBase =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_BASE_URL : undefined;
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:8000";

    const parts = hostname.split(".");
    if (parts.length >= 3) {
      const [subdomain, ...rest] = parts;
      // Convert <subdomain>.<domain> into <subdomain>-api.<domain> (e.g. reg -> reg-api).
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

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  resetSessionExpiredRedirect();
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Query param set when redirecting to login after session expiry. */
export const SESSION_EXPIRED_PARAM = "expired";

export const SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";

/** Internal marker thrown after ``handleSessionExpired`` triggers redirect. */
export const SESSION_EXPIRED_ERROR = "SESSION_EXPIRED";

let sessionExpiredRedirecting = false;

/** Reset redirect guard after a successful sign-in. */
export function resetSessionExpiredRedirect(): void {
  sessionExpiredRedirecting = false;
}

export function loginHrefFromPathname(pathname: string): string {
  if (pathname.startsWith("/dashboard/admin")) return "/login/admin";
  if (pathname.startsWith("/dashboard/supervisor")) return "/login/supervisor";
  if (pathname.startsWith("/dashboard/inspector")) return "/login/inspector";
  if (pathname.startsWith("/dashboard/depot-keeper")) return "/login/depot-keeper";
  if (pathname.startsWith("/dashboard/subject-officer")) return "/login/admin";
  return "/";
}

/**
 * Clear auth and send the user to the role-appropriate login with an expired-session notice.
 * No-op on the server, on login routes, or when a redirect is already in progress.
 */
export function handleSessionExpired(loginHrefOverride?: string): void {
  if (typeof window === "undefined") return;
  if (sessionExpiredRedirecting) return;
  if (window.location.pathname.startsWith("/login")) return;

  sessionExpiredRedirecting = true;
  clearAuth();
  const loginHref = loginHrefOverride ?? loginHrefFromPathname(window.location.pathname);
  const url = `${loginHref}?${SESSION_EXPIRED_PARAM}=true`;
  window.location.assign(url);
}

/** If ``res`` is 401, redirect to login and throw ``SESSION_EXPIRED_ERROR``. */
export function throwIfUnauthorized(res: Response, loginHrefOverride?: string): void {
  if (res.status !== 401) return;
  handleSessionExpired(loginHrefOverride);
  throw new Error(SESSION_EXPIRED_ERROR);
}

/** Fired after ``setStoredToken`` from select-posting (and similar) so layouts can refetch ``/auth/me``. */
export const AUTH_TOKEN_UPDATED_EVENT = "exam-tools-auth-token-updated";

export type ApiRole =
  | "SUPER_ADMIN"
  | "TEST_ADMIN_OFFICER"
  | "FINANCE_OFFICER"
  | "EXECUTIVE_VIEWER"
  | "SUPERVISOR"
  | "INSPECTOR"
  | "SUBJECT_OFFICER"
  | "DEPOT_KEEPER";

/** Roles that may use the admin dashboard layout (super admin + monitoring / executive / finance). */
export const ADMIN_PORTAL_ROLES: ApiRole[] = [
  "SUPER_ADMIN",
  "TEST_ADMIN_OFFICER",
  "FINANCE_OFFICER",
  "EXECUTIVE_VIEWER",
];

export type UserMe = {
  id: string;
  full_name: string;
  email: string | null;
  school_code: string | null;
  /** Resolved from schools when ``school_code`` is set. */
  school_name: string | null;
  phone_number: string | null;
  /** Set for depot keeper accounts (sign-in username). */
  username?: string | null;
  role: ApiRole;
  depot_id?: string | null;
  depot_code?: string | null;
  depot_name?: string | null;
  /** When inspector JWT includes ``inspector_posting_id``; centre label for header subtitle. */
  inspector_workspace_label?: string | null;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  role: ApiRole | number;
  school_code?: string | null;
  email?: string | null;
};

function dashboardPathForLoginRole(role: TokenResponse["role"]): string {
  if (role === "SUPER_ADMIN" || role === 0) return "/dashboard/admin";
  if (role === "TEST_ADMIN_OFFICER" || role === 5) return "/dashboard/admin/monitoring";
  if (role === "FINANCE_OFFICER" || role === 6) return "/dashboard/admin";
  if (role === "EXECUTIVE_VIEWER" || role === 7) return "/dashboard/admin/monitoring";
  if (role === "SUPERVISOR" || role === 10) return "/dashboard/supervisor";
  if (role === "INSPECTOR" || role === 20) return "/dashboard/inspector";
  if (role === "SUBJECT_OFFICER" || role === 25) return "/dashboard/subject-officer";
  if (role === "DEPOT_KEEPER" || role === 30) return "/dashboard/depot-keeper";
  return "/";
}

export function dashboardPathForRole(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/dashboard/admin";
    case "TEST_ADMIN_OFFICER":
    case "EXECUTIVE_VIEWER":
      return "/dashboard/admin/monitoring";
    case "FINANCE_OFFICER":
      return "/dashboard/admin";
    case "SUPERVISOR":
      return "/dashboard/supervisor";
    case "INSPECTOR":
      return "/dashboard/inspector";
    case "SUBJECT_OFFICER":
      return "/dashboard/subject-officer";
    case "DEPOT_KEEPER":
      return "/dashboard/depot-keeper";
    default:
      return "/";
  }
}

type ValidationDetail = {
  msg?: string;
  loc?: unknown[];
};

function fieldLabelFromLoc(loc: unknown[] | undefined): string | null {
  if (!Array.isArray(loc) || loc.length === 0) return null;
  const field = String(loc[loc.length - 1]);
  switch (field) {
    case "email":
      return "Email";
    case "password":
      return "Password";
    case "phone_number":
      return "Phone number";
    case "school_code":
      return "School code";
    case "username":
      return "Username";
    default:
      return null;
  }
}

/** Turn raw API/Pydantic auth errors into short messages for login forms. */
export function humanizeAuthErrorMessage(message: string, fieldLabel?: string | null): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("not a valid email address") || lower.includes("@-sign")) {
    return fieldLabel
      ? `${fieldLabel}: enter a valid email address (for example name@example.com).`
      : "Enter a valid email address (for example name@example.com).";
  }
  if (lower === "incorrect credentials") {
    return "Incorrect sign-in details. Check your entries and try again.";
  }
  if (lower.includes("no subject assignment")) {
    return "You are not assigned to any subject for the active examination. Contact your administrator.";
  }
  if (lower === "inactive user") {
    return "This account is inactive. Contact your administrator.";
  }
  if (lower.includes("field required") || lower === "missing") {
    return fieldLabel ? `${fieldLabel} is required.` : "Please fill in all required fields.";
  }

  return normalized;
}

export async function parseErrorMessage(res: Response): Promise<string> {
  const fallback =
    res.status === 422
      ? "Check the details you entered and try again."
      : `Request failed (${res.status})`;
  try {
    const text = await res.text();
    if (!text) return fallback;
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return humanizeAuthErrorMessage(j.detail);
    if (Array.isArray(j.detail)) {
      const parts = j.detail.map((x) => {
        if (typeof x === "object" && x !== null && "msg" in x) {
          const detail = x as ValidationDetail;
          const fieldLabel = fieldLabelFromLoc(detail.loc);
          return humanizeAuthErrorMessage(String(detail.msg ?? x), fieldLabel);
        }
        return humanizeAuthErrorMessage(String(x));
      });
      return parts.join(" ") || fallback;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

const API_NETWORK_ERROR_DEV =
  "Network error: could not reach the API. Check that the backend is running, NEXT_PUBLIC_API_BASE_URL matches the server, and browser devtools Network tab for CORS or blocked requests.";

const API_NETWORK_ERROR_PROD =
  "Unable to connect to the server. Please check your connection and try again later.";

/** True on localhost; also when Next dev server runs (NODE_ENV is forced to development). */
export function useDetailedApiNetworkErrors(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }
  return process.env.NODE_ENV !== "production";
}

export function apiNetworkErrorMessage(): string {
  return useDetailedApiNetworkErrors() ? API_NETWORK_ERROR_DEV : API_NETWORK_ERROR_PROD;
}

export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padStart(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json =
      typeof atob !== "undefined"
        ? atob(padded)
        : Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** ``inspector_posting_id`` from the current access token (global workspace), if present. */
export function getInspectorPostingIdFromToken(): string | null {
  const token = getStoredToken();
  if (!token) return null;
  const payload = parseJwtPayload(token);
  const raw = payload?.inspector_posting_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw != null && String(raw).trim() !== "") return String(raw).trim();
  return null;
}

/**
 * When the inspector has more than one posting, the session token must include
 * ``inspector_posting_id`` (set on login if only one posting, or via select-workspace).
 * Per-page workspace dropdowns are not shown.
 */
export function inspectorMustPickWorkspaceGlobally(postingsCount: number): boolean {
  return postingsCount > 1 && getInspectorPostingIdFromToken() == null;
}

/**
 * Choose which inspector posting to use on dashboard pages: preserve in-page selection when
 * still valid, otherwise use the JWT workspace (after login / select-workspace), else first listing.
 */
export function pickInspectorPostingId(
  items: { id: string }[],
  prev: string | null,
): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0].id;
  if (prev && items.some((x) => x.id === prev)) return prev;
  const jwtId = getInspectorPostingIdFromToken();
  if (jwtId && items.some((x) => x.id === jwtId)) return jwtId;
  return items[0]?.id ?? null;
}

export async function loginInspector(phone_number: string, password: string): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/inspector/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number, password }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  if (data.role === "INSPECTOR" || data.role === 20) {
    const jwt = parseJwtPayload(data.access_token);
    if (jwt?.inspector_posting_id) return "/dashboard/inspector";
    return "/dashboard/inspector/select-workspace";
  }
  return dashboardPathForLoginRole(data.role);
}

export async function selectInspectorPosting(posting_id: string): Promise<TokenResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${getApiBaseUrl()}/auth/inspector/select-posting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ posting_id }),
  });
  throwIfUnauthorized(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_TOKEN_UPDATED_EVENT));
  }
  return data;
}

export async function loginSupervisor(
  school_code: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/supervisor/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ school_code, password }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  return dashboardPathForLoginRole(data.role);
}

export async function loginDepotKeeper(username: string, password: string): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/depot-keeper/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  return dashboardPathForLoginRole(data.role);
}

export async function loginSuperAdmin(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/super-admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  return dashboardPathForLoginRole(data.role);
}

export async function getMe(): Promise<UserMe> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  throwIfUnauthorized(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as UserMe;
}
