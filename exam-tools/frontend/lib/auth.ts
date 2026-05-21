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
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
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
  if (role === "FINANCE_OFFICER" || role === 6) return "/dashboard/admin/exam-officials";
  if (role === "EXECUTIVE_VIEWER" || role === 7) return "/dashboard/admin/monitoring";
  if (role === "SUPERVISOR" || role === 10) return "/dashboard/supervisor";
  if (role === "INSPECTOR" || role === 20) return "/dashboard/inspector";
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
      return "/dashboard/admin/exam-officials";
    case "SUPERVISOR":
      return "/dashboard/supervisor";
    case "INSPECTOR":
      return "/dashboard/inspector";
    case "DEPOT_KEEPER":
      return "/dashboard/depot-keeper";
    default:
      return "/";
  }
}

export async function parseErrorMessage(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  try {
    const text = await res.text();
    if (!text) return fallback;
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      const parts = j.detail.map((x) =>
        typeof x === "object" && x !== null && "msg" in x
          ? String((x as { msg: string }).msg)
          : String(x),
      );
      return parts.join(", ") || fallback;
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
    body: JSON.stringify({ email, password }),
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
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as UserMe;
}
