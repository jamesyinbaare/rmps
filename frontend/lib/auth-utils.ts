/**
 * Utility functions for authentication and automatic logout
 */

let logoutNotificationShown = false;

/**
 * Clear all authentication tokens from localStorage
 */
export function clearAllTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
}

/**
 * Check if refresh token exists
 */
export function hasRefreshToken(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("refresh_token") !== null;
}

/**
 * Get refresh token from localStorage
 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

/**
 * Handle automatic logout when token expires
 * This is called from API error handlers
 * Now checks for refresh token before logging out
 */
export function handleTokenExpiration(): void {
  if (typeof window === "undefined") return;

  // Prevent multiple logout notifications
  if (logoutNotificationShown) return;
  logoutNotificationShown = true;

  // Clear all tokens (both access and refresh)
  clearAllTokens();

  // Only redirect if not already on login page
  if (window.location.pathname !== "/login") {
    // Redirect to login with expired parameter
    window.location.href = "/login?expired=true";
  }
}

/**
 * Reset the logout notification flag (useful after successful login)
 */
export function resetLogoutNotification(): void {
  logoutNotificationShown = false;
}
