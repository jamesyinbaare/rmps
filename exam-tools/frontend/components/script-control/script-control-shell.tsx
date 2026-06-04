"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { apiJson, getStaffDefaultExamination, type Examination } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ScriptControlRecordType = "regular" | "irregular";

export function parseScriptControlRecordType(raw: string | null): ScriptControlRecordType {
  return raw === "irregular" ? "irregular" : "regular";
}

export function buildScriptControlQuery(params: {
  exam: number | null;
  type: ScriptControlRecordType;
  extra?: Record<string, string | undefined>;
}): string {
  const q = new URLSearchParams();
  if (params.exam !== null) q.set("exam", String(params.exam));
  if (params.type === "irregular") q.set("type", "irregular");
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      if (v?.trim()) q.set(k, v.trim());
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function ScriptControlShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isEditMode = pathname.includes("/script-control/edit") || pathname.includes("/script-control/school");

  const examParam = searchParams.get("exam");
  const typeParam = parseScriptControlRecordType(searchParams.get("type"));

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(examParam ? parseInt(examParam, 10) : null);
  const [recordType, setRecordType] = useState<ScriptControlRecordType>(typeParam);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(data);
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (examParam) {
      const n = parseInt(examParam, 10);
      if (Number.isFinite(n)) setExamId(n);
    }
    setRecordType(parseScriptControlRecordType(searchParams.get("type")));
  }, [examParam, searchParams]);

  useEffect(() => {
    if (examParam) return;
    let cancelled = false;
    (async () => {
      try {
        const ex = await getStaffDefaultExamination();
        if (cancelled) return;
        setExamId(ex.id);
        const extra: Record<string, string | undefined> = {};
        for (const key of ["subject", "paper", "school", "status", "region", "zone", "school_q", "page", "limit", "detail", "subject_type"]) {
          const v = searchParams.get(key);
          if (v) extra[key] = v;
        }
        const base = isEditMode ? "/dashboard/admin/script-control/edit" : "/dashboard/admin/script-control";
        router.replace(`${base}${buildScriptControlQuery({ exam: ex.id, type: typeParam, extra })}`, {
          scroll: false,
        });
      } catch {
        /* no default exam — user picks manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examParam, isEditMode, router, searchParams, typeParam]);

  const syncSharedParams = useCallback(
    (nextExam: number | null, nextType: ScriptControlRecordType) => {
      const extra: Record<string, string | undefined> = {};
      for (const key of ["subject", "paper", "school", "status", "region", "zone", "school_q", "page", "limit", "detail", "subject_type"]) {
        const v = searchParams.get(key);
        if (v) extra[key] = v;
      }
      const base = isEditMode ? "/dashboard/admin/script-control/edit" : "/dashboard/admin/script-control";
      router.replace(`${base}${buildScriptControlQuery({ exam: nextExam, type: nextType, extra })}`, {
        scroll: false,
      });
    },
    [isEditMode, router, searchParams],
  );

  const viewHref = useMemo(
    () =>
      `/dashboard/admin/script-control${buildScriptControlQuery({
        exam: examId,
        type: recordType,
        extra: Object.fromEntries(
          ["subject", "paper", "status", "region", "zone", "school_q", "page", "limit", "detail", "subject_type"].map((k) => [
            k,
            searchParams.get(k) ?? undefined,
          ]),
        ),
      })}`,
    [examId, recordType, searchParams],
  );

  const editHref = useMemo(
    () =>
      `/dashboard/admin/script-control/edit${buildScriptControlQuery({
        exam: examId,
        type: recordType,
        extra: Object.fromEntries(
          ["school", "subject", "region", "zone", "paper", "status", "subject_type"].map((k) => [
            k,
            searchParams.get(k) ?? undefined,
          ]),
        ),
      })}`,
    [examId, recordType, searchParams],
  );

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-visible">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Worked scripts control</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {isEditMode
            ? "Enter or correct envelope counts for a school."
            : "View mode — monitor packed scripts nationally by subject and paper, including schools that have not submitted."}
        </p>
      </div>

      <div
        className={cn(
          "rounded-xl border bg-card p-4",
          isEditMode ? "border-primary/35 ring-1 ring-primary/10" : "border-border",
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={!isEditMode ? "default" : "outline"} asChild>
              <Link href={viewHref}>View records</Link>
            </Button>
            <Button type="button" variant={isEditMode ? "default" : "outline"} asChild>
              <Link href={editHref}>Edit records</Link>
            </Button>
            {isEditMode ? (
              <span className="self-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                Editing
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 sm:max-w-xs">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Examination
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input-border bg-background px-3 text-sm"
                value={examId ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? parseInt(e.target.value, 10) : null;
                  setExamId(v);
                  syncSharedParams(v, recordType);
                }}
              >
                <option value="">Select examination…</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.exam_type} {ex.exam_series ? `(${ex.exam_series})` : ""} — {ex.year}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button
                type="button"
                size="sm"
                variant={recordType === "regular" ? "default" : "outline"}
                onClick={() => {
                  setRecordType("regular");
                  syncSharedParams(examId, "regular");
                }}
              >
                Regular
              </Button>
              <Button
                type="button"
                size="sm"
                variant={recordType === "irregular" ? "default" : "outline"}
                onClick={() => {
                  setRecordType("irregular");
                  syncSharedParams(examId, "irregular");
                }}
              >
                Irregular
              </Button>
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

export function ScriptControlShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[200px]" />}>
      <ScriptControlShellInner>{children}</ScriptControlShellInner>
    </Suspense>
  );
}

export function useScriptControlShellParams() {
  const searchParams = useSearchParams();
  const examRaw = searchParams.get("exam");
  const examId = examRaw && Number.isFinite(parseInt(examRaw, 10)) ? parseInt(examRaw, 10) : null;
  const recordType = parseScriptControlRecordType(searchParams.get("type"));
  return { searchParams, examId, recordType };
}
