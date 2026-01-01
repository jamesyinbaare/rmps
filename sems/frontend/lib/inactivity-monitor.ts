/**
 * Inactivity monitoring service
 * Tracks user activity and automatically logs out after a period of inactivity
 */

import { logout } from "./api";
import { toast } from "sonner";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIME_MS = 25 * 60 * 1000; // 25 minutes (5 minutes before logout)

let inactivityTimer: NodeJS.Timeout | null = null;
let warningTimer: NodeJS.Timeout | null = null;
let countdownInterval: NodeJS.Timeout | null = null;
let warningShown = false;
let isMonitoring = false;
let visibilityChangeHandler: (() => void) | null = null;
let activityHandlers: Map<string, () => void> = new Map();

// Event system for dialog communication
type InactivityEventData = { remainingSeconds?: number } | undefined;

const eventListeners = new Set<(data: InactivityEventData) => void>();

export function onInactivityEvent(
  listener: (data: InactivityEventData) => void
): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

function emitInactivityEvent(data: InactivityEventData): void {
  eventListeners.forEach((listener) => {
    try {
      listener(data);
    } catch (error) {
      console.error("Error in inactivity event listener:", error);
    }
  });
}

/**
 * Reset the inactivity timer
 */
function resetTimer(): void {
  if (!isMonitoring) return;

  // Clear existing timers
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
    warningShown = false;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Set warning timer (5 minutes before logout)
  warningTimer = setTimeout(() => {
    if (!warningShown && isMonitoring) {
      warningShown = true;
      console.log("[InactivityMonitor] Showing warning dialog");

      const remainingMs = INACTIVITY_TIMEOUT_MS - WARNING_TIME_MS;
      let remainingSeconds = Math.floor(remainingMs / 1000);

      // Emit warning start event
      emitInactivityEvent({ remainingSeconds });

      // Start countdown interval
      countdownInterval = setInterval(() => {
        remainingSeconds -= 1;

        if (remainingSeconds <= 0) {
          // Countdown finished, will be handled by logout timer
          if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
          }
          emitInactivityEvent(undefined); // End warning
        } else {
          emitInactivityEvent({ remainingSeconds });
        }
      }, 1000);
    }
  }, WARNING_TIME_MS);

  // Set logout timer
  inactivityTimer = setTimeout(() => {
    if (isMonitoring) {
      console.log("[InactivityMonitor] Inactivity timeout reached, logging out");
      handleInactivityLogout();
    }
  }, INACTIVITY_TIMEOUT_MS);
}

/**
 * Handle automatic logout due to inactivity
 */
async function handleInactivityLogout(): Promise<void> {
  try {
    emitInactivityEvent(undefined); // End warning before logout
    await logout();
    toast.error("You have been logged out due to inactivity");

    // Redirect to login page
    if (typeof window !== "undefined") {
      window.location.href = "/login?inactive=true";
    }
  } catch (error) {
    console.error("Error during inactivity logout:", error);
    // Still redirect even if logout fails
    if (typeof window !== "undefined") {
      window.location.href = "/login?inactive=true";
    }
  }
}

/**
 * Activity event handler
 */
function handleActivity(): void {
  if (!isMonitoring) return;
  // Reset the timer on any activity
  resetTimer();
}

/**
 * Handle user choosing to stay logged in
 */
export function handleStayLoggedIn(): void {
  console.log("[InactivityMonitor] User chose to stay logged in");

  // Reset warning state first to prevent new warnings
  warningShown = false;

  // Clear countdown interval if running (must be before emitting event)
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Emit event to close dialog (after clearing interval to prevent race condition)
  emitInactivityEvent(undefined); // End warning

  // Reset the timer (this will start fresh timers)
  resetTimer();
}

/**
 * Start monitoring user activity
 */
export function startInactivityMonitor(): void {
  if (isMonitoring) {
    console.log("[InactivityMonitor] Already monitoring, skipping start");
    return; // Already monitoring
  }

  console.log("[InactivityMonitor] Starting inactivity monitor");
  isMonitoring = true;
  warningShown = false;

  // Listen for user activity events
  const events = [
    "mousedown",
    "mousemove",
    "keydown",
    "keypress",
    "scroll",
    "touchstart",
    "click",
    "focus",
  ];

  // Store handlers so we can remove them later
  events.forEach((event) => {
    const handler = () => {
      handleActivity();
    };
    activityHandlers.set(event, handler);
    window.addEventListener(event, handler, true);
  });

  // Also reset on visibility change (user returns to tab)
  visibilityChangeHandler = () => {
    if (!document.hidden) {
      handleActivity();
    }
  };
  document.addEventListener("visibilitychange", visibilityChangeHandler);

  // Start the timer
  resetTimer();
}

/**
 * Stop monitoring user activity
 */
export function stopInactivityMonitor(): void {
  if (!isMonitoring) {
    return;
  }

  console.log("[InactivityMonitor] Stopping inactivity monitor");
  isMonitoring = false;

  // Clear timers
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  warningShown = false;
  emitInactivityEvent(undefined); // End warning

  // Remove event listeners
  activityHandlers.forEach((handler, event) => {
    window.removeEventListener(event, handler, true);
  });
  activityHandlers.clear();

  // Remove visibility change listener
  if (visibilityChangeHandler) {
    document.removeEventListener("visibilitychange", visibilityChangeHandler);
    visibilityChangeHandler = null;
  }
}

/**
 * Manually reset the inactivity timer (useful for API calls)
 */
export function resetInactivityTimer(): void {
  if (isMonitoring) {
    resetTimer();
  }
}
