"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseExaminersTab } from "@/components/examiners/utils";
import type { ExaminersTab } from "@/components/examiners/types";
import { getStaffDefaultExamination, type Examination } from "@/lib/api";

type Options = {
  exams: Examination[];
  /** When true, skip API default exam and use the sole exam in `exams`. */
  singleExamMode?: boolean;
};

export function useExaminersUrl({ exams, singleExamMode = false }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const defaultExamResolvedRef = useRef(false);

  const [examId, setExamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ExaminersTab>("roster");

  useEffect(() => {
    if (exams.length === 0) return;

    const rawExam = searchParams.get("exam");
    let nextExamId: number | null = null;
    if (rawExam != null && rawExam !== "") {
      const parsed = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(parsed) && exams.some((e) => e.id === parsed)) {
        nextExamId = parsed;
      }
    }

    const rawTab = searchParams.get("tab");
    const nextTab = parseExaminersTab(rawTab);

    setExamId(nextExamId);
    setActiveTab(nextTab);

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const p = new URLSearchParams(searchParams.toString());
      let changed = false;
      if (rawTab !== nextTab) {
        p.set("tab", nextTab);
        changed = true;
      }
      if (rawExam != null && rawExam !== "" && nextExamId == null) {
        p.delete("exam");
        changed = true;
      }
      if (changed) {
        const qs = p.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    }
  }, [exams, pathname, router, searchParams]);

  useEffect(() => {
    if (exams.length === 0) return;
    if (searchParams.get("exam")) return;
    if (defaultExamResolvedRef.current) return;

    let cancelled = false;

    (async () => {
      let resolvedId: number | null = null;

      if (singleExamMode && exams.length === 1) {
        resolvedId = exams[0]!.id;
      } else {
        try {
          const ex = await getStaffDefaultExamination();
          if (exams.some((e) => e.id === ex.id)) {
            resolvedId = ex.id;
          } else if (exams.length > 0) {
            resolvedId = exams[0]!.id;
          }
        } catch {
          if (exams.length > 0) resolvedId = exams[0]!.id;
        }
      }

      if (cancelled || resolvedId == null) return;

      defaultExamResolvedRef.current = true;
      const nextTab = parseExaminersTab(searchParams.get("tab"));
      setExamId(resolvedId);
      setActiveTab(nextTab);

      const p = new URLSearchParams(searchParams.toString());
      p.set("exam", String(resolvedId));
      p.set("tab", nextTab);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [exams, pathname, router, searchParams, singleExamMode]);

  const pushUrl = useCallback(
    (nextExamId: number | null, nextTab: ExaminersTab) => {
      const p = new URLSearchParams(searchParams.toString());
      if (nextExamId != null) p.set("exam", String(nextExamId));
      else p.delete("exam");
      p.set("tab", nextTab);
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setExamIdPush = useCallback(
    (id: number | null) => {
      setExamId(id);
      pushUrl(id, activeTab);
    },
    [activeTab, pushUrl],
  );

  const setActiveTabPush = useCallback(
    (tab: ExaminersTab) => {
      setActiveTab(tab);
      pushUrl(examId, tab);
    },
    [examId, pushUrl],
  );

  return {
    examId,
    activeTab,
    setExamId: setExamIdPush,
    setActiveTab: setActiveTabPush,
  };
}
