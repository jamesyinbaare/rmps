"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  startInactivityMonitor,
  stopInactivityMonitor,
} from "@/lib/inactivity-monitor";
import { isAuthenticated } from "@/lib/api";

/**
 * React hook to manage inactivity monitoring
 * Starts monitoring when component mounts and user is authenticated
 * Stops monitoring when component unmounts or user logs out
 */
export function useInactivityMonitor(): void {
  const pathname = usePathname();
  const wasAuthenticated = useRef(isAuthenticated());

  useEffect(() => {
    // Don't monitor on login page
    if (pathname === "/login") {
      stopInactivityMonitor();
      return;
    }

    // Check authentication state periodically to react to login/logout
    const checkAuth = () => {
      // Don't check if we're on login page
      if (pathname === "/login") {
        stopInactivityMonitor();
        return;
      }

      const currentlyAuthenticated = isAuthenticated();

      // If authentication state changed, start or stop monitoring
      if (currentlyAuthenticated !== wasAuthenticated.current) {
        wasAuthenticated.current = currentlyAuthenticated;

        if (currentlyAuthenticated) {
          startInactivityMonitor();
        } else {
          stopInactivityMonitor();
        }
      } else if (currentlyAuthenticated) {
        // Make sure monitoring is started if authenticated (in case it was stopped for some reason)
        startInactivityMonitor();
      }
    };

    // Check immediately
    checkAuth();

    // Check periodically (every 2 seconds)
    const authCheckInterval = setInterval(checkAuth, 2000);

    return () => {
      clearInterval(authCheckInterval);
      stopInactivityMonitor();
    };
  }, [pathname]); // Re-run when pathname changes
}
