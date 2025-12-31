/**
 * Utility functions for authentication and automatic logout
 */

let logoutNotificationShown = false;

/**
 * Handle automatic logout when token expires
 * This is called from API error handlers
 */
export function handleTokenExpiration(): void {
  if (typeof window === "undefined") return;

  // Prevent multiple logout notifications
  if (logoutNotificationShown) return;
  logoutNotificationShown = true;

  // Clear token
  localStorage.removeItem("auth_token");

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
