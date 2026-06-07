"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseExaminersTab } from "@/components/examiners/utils";
import type { ExaminersTab } from "@/components/examiners/types";
import type { Examination } from "@/lib/api";

type Options = {
  exams: Examination[];
};

export function useExaminersUrl({ exams }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

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
