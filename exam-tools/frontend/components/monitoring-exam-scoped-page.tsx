"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { executiveFormInputClass } from "@/components/executive-ui";
import {
  EXECUTIVE_EXAM_ID_PARAM,
  resolveExecutiveExamId,
  writeExecutiveSelectedExamId,
} from "@/lib/executive-selected-examination";
import { type Examination } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { getCachedExaminations } from "@/lib/executive-overview-cache";
import {
  canAccessMonitoring,
  parseMonitoringExamIdFromUrl,
} from "@/lib/monitoring-access";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

type Props = {
  children: (examId: number) => ReactNode;
  /** When true, show an examination dropdown (Test Admin subpages). Executive centres stay read-only. */
  showExamPicker?: boolean;
};

function MonitoringExamScopedPageContent({ children, showExamPicker = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        if (!canAccessMonitoring(user.role)) {
          router.replace("/");
        }
      } catch {
        if (!cancelled) router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const result = await getCachedExaminations();
        if (cancelled) return;
        const list = result.data.exams;
        const defaultExam = result.data.defaultExam;
        setExams(list);
        const fromUrl = parseMonitoringExamIdFromUrl(
          searchParams.get(EXECUTIVE_EXAM_ID_PARAM),
        );
        setExamId((prev) => {
          const resolved = resolveExecutiveExamId({
            exams: list,
            fromUrl,
            previous: prev,
            defaultExam,
          });
          if (resolved != null) writeExecutiveSelectedExamId(resolved);
          return resolved;
        });
        setUrlHydrated(true);
      } catch (e) {
        if (!cancelled) {
          setExams([]);
          setExamId(null);
          setError(e instanceof Error ? e.message : "Could not load examinations");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!urlHydrated || examId == null) return;
    writeExecutiveSelectedExamId(examId);
    const p = new URLSearchParams(searchParams.toString());
    p.set(EXECUTIVE_EXAM_ID_PARAM, String(examId));
    const next = p.toString();
    if (next === searchParams.toString()) return;
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [urlHydrated, examId, pathname, router, searchParams]);

  const selectedExam = examId != null ? exams.find((e) => e.id === examId) : undefined;

  function handleExamChange(nextId: number | null) {
    setExamId(nextId);
    writeExecutiveSelectedExamId(nextId);
  }

  return (
    <div className="space-y-4">
      {showExamPicker && exams.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">Examination</span>
            <select
              className={executiveFormInputClass}
              value={examId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                handleExamChange(v === "" ? null : Number(v));
              }}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : selectedExam ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Examination</span>
          {": "}
          {formatExamLabel(selectedExam)}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {examId != null ? children(examId) : null}
    </div>
  );
}

export function MonitoringExamScopedPage({ children, showExamPicker }: Props) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <MonitoringExamScopedPageContent showExamPicker={showExamPicker}>
        {children}
      </MonitoringExamScopedPageContent>
    </Suspense>
  );
}
