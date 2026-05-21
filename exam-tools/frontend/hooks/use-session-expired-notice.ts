"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SESSION_EXPIRED_PARAM } from "@/lib/auth";

/**
 * Reads ``?expired=true`` on login pages, exposes whether to show the session banner,
 * and strips the param from the URL so refresh does not re-show it.
 */
export function useSessionExpiredNotice(): boolean {
  const searchParams = useSearchParams();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (searchParams.get(SESSION_EXPIRED_PARAM) !== "true") return;

    setShowBanner(true);

    const next = new URLSearchParams(window.location.search);
    next.delete(SESSION_EXPIRED_PARAM);
    const qs = next.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", url);
  }, [searchParams]);

  return showBanner;
}
