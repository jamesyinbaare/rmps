"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionState = {
  examinerId: string | null;
  paperNumber: number | null;
};

function buildSessionQuery(session: SessionState): string {
  const p = new URLSearchParams();
  if (session.examinerId) p.set("examiner", session.examinerId);
  if (session.paperNumber != null) p.set("paper", String(session.paperNumber));
  return p.toString();
}

function parseSessionFromUrl(searchParams: URLSearchParams): SessionState {
  const examinerId = searchParams.get("examiner")?.trim() || null;
  let paperNumber: number | null = null;
  const rawPaper = searchParams.get("paper");
  if (rawPaper) {
    const parsed = Number.parseInt(rawPaper, 10);
    if (!Number.isNaN(parsed) && parsed >= 1) paperNumber = parsed;
  }
  return { examinerId, paperNumber };
}

export function useMarkedScriptReturnsUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const sessionRef = useRef<SessionState>({ examinerId: null, paperNumber: null });

  const [session, setSessionState] = useState<SessionState>(sessionRef.current);

  const replaceUrlForSession = useCallback(
    (next: SessionState) => {
      const qs = buildSessionQuery(next);
      if (qs === searchParams.toString()) return;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const parsed = parseSessionFromUrl(searchParams);
    sessionRef.current = parsed;
    setSessionState(parsed);
    hydratedRef.current = true;
    replaceUrlForSession(parsed);
  }, [replaceUrlForSession, searchParams]);

  const setSession = useCallback(
    (next: Partial<SessionState>) => {
      const merged = { ...sessionRef.current, ...next };
      sessionRef.current = merged;
      setSessionState(merged);
      replaceUrlForSession(merged);
    },
    [replaceUrlForSession],
  );

  return { session, setSession, ready: hydratedRef.current };
}
