import { getAccessToken } from "./api";

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function requireAuth(): void {
  if (!isAuthenticated()) {
    window.location.href = "/login";
  }
}
