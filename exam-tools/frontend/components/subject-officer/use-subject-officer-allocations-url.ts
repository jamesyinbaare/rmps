"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionState = {
  examId: number | null;
  subjectId: number | null;
  examinerId: string | null;
};

type Options = {
  examIds: number[];
};

function buildSessionQuery(session: SessionState): string {
  const p = new URLSearchParams();
  if (session.examId != null) p.set("exam", String(session.examId));
  if (session.subjectId != null) p.set("subject", String(session.subjectId));
  if (session.examinerId) p.set("examiner", session.examinerId);
  return p.toString();
}

function parseSessionFromUrl(examIds: number[], searchParams: URLSearchParams): SessionState {
  const rawExam = searchParams.get("exam");
  const rawSubject = searchParams.get("subject");
  const rawExaminer = searchParams.get("examiner");

  let examId: number | null = null;
  if (rawExam) {
    const parsed = Number.parseInt(rawExam, 10);
    if (!Number.isNaN(parsed) && examIds.includes(parsed)) examId = parsed;
  }
  let subjectId: number | null = null;
  if (rawSubject) {
    const parsed = Number.parseInt(rawSubject, 10);
    if (!Number.isNaN(parsed)) subjectId = parsed;
  }

  const examinerId = rawExaminer?.trim() || null;

  return { examId, subjectId, examinerId };
}

export function useSubjectOfficerAllocationsUrl({ examIds }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const sessionRef = useRef<SessionState>({
    examId: null,
    subjectId: null,
    examinerId: null,
  });

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
    if (examIds.length === 0) return;

    const parsed = parseSessionFromUrl(examIds, searchParams);
    sessionRef.current = parsed;
    setSessionState(parsed);
    hydratedRef.current = true;
    replaceUrlForSession(parsed);
  }, [examIds, replaceUrlForSession, searchParams]);

  const setSession = useCallback(
    (next: Partial<SessionState>) => {
      const merged = { ...sessionRef.current, ...next };
      sessionRef.current = merged;
      setSessionState(merged);
      replaceUrlForSession(merged);
    },
    [replaceUrlForSession],
  );

  return { session, setSession, ready: hydratedRef.current || examIds.length > 0 };
}
