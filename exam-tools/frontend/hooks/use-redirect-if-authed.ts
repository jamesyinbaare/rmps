"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  clearAuth,
  dashboardPathForRole,
  getInspectorPostingIdFromToken,
  getMe,
  getStoredToken,
  subjectOfficerDashboardPathFromToken,
} from "@/lib/auth";

/** If a token exists and is valid, send the user to their dashboard. */
export function useRedirectIfAuthenticated() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getStoredToken()) return;
      try {
        const me = await getMe();
        if (!cancelled) {
          if (me.role === "INSPECTOR") {
            const hasWorkspace = Boolean(getInspectorPostingIdFromToken());
            router.replace(
              hasWorkspace ? "/dashboard/inspector" : "/dashboard/inspector/select-workspace",
            );
          } else if (me.role === "SUBJECT_OFFICER") {
            router.replace(subjectOfficerDashboardPathFromToken());
          } else {
            router.replace(dashboardPathForRole(me.role));
          }
        }
      } catch {
        clearAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);
}
