const TOKEN_KEY = "exam_tools_access_token";

export function getApiBaseUrl(): string {
  return (
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) ||
    "http://localhost:8000"
  );
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

export type ApiRole = "SUPER_ADMIN" | "SUPERVISOR" | "INSPECTOR" | "DEPOT_KEEPER";

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
  if (role === "SUPERVISOR" || role === 10) return "/dashboard/supervisor";
  if (role === "INSPECTOR" || role === 20) return "/dashboard/inspector";
  if (role === "DEPOT_KEEPER" || role === 30) return "/dashboard/depot-keeper";
  return "/";
}

export function dashboardPathForRole(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/dashboard/admin";
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

export async function loginInspector(
  school_code: string,
  phone_number: string,
): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/auth/inspector/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ school_code, phone_number }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as TokenResponse;
  setStoredToken(data.access_token);
  return dashboardPathForLoginRole(data.role);
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
