"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  clearAuth,
  dashboardPathForRole,
  getMe,
  getStoredToken,
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
        if (!cancelled) router.replace(dashboardPathForRole(me.role));
      } catch {
        clearAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);
}
