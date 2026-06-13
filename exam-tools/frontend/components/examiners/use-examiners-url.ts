"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseExaminersTab } from "@/components/examiners/utils";
import type { ExaminersTab } from "@/components/examiners/types";
import { getStaffDefaultExamination, type Examination } from "@/lib/api";
import {
  parseScriptControlSubjectTypeFilter,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";

type Options = {
  exams: Examination[];
  /** When true, skip API default exam and use the sole exam in `exams`. */
  singleExamMode?: boolean;
  /** When true, do not auto-select an examination; user must choose explicitly. */
  requireExamSelection?: boolean;
  /** Persist subject type / subject filters in the URL. */
  syncSubjectInUrl?: boolean;
};

type UrlPatch = {
  examId?: number | null;
  tab?: ExaminersTab;
  subjectTypeFilter?: ScriptControlSubjectTypeFilter;
  subjectId?: string;
};

export function useExaminersUrl({
  exams,
  singleExamMode = false,
  requireExamSelection = false,
  syncSubjectInUrl = false,
}: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const defaultExamResolvedRef = useRef(false);

  const [examId, setExamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ExaminersTab>("roster");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState("");

  const writeUrl = useCallback(
    (
      patch: UrlPatch,
      options?: { replace?: boolean; base?: { examId: number | null; tab: ExaminersTab; subjectTypeFilter: ScriptControlSubjectTypeFilter; subjectId: string } },
    ) => {
      const base = options?.base ?? {
        examId,
        tab: activeTab,
        subjectTypeFilter,
        subjectId,
      };
      const nextExamId = patch.examId !== undefined ? patch.examId : base.examId;
      const nextTab = patch.tab ?? base.tab;
      const nextSubjectType = patch.subjectTypeFilter ?? base.subjectTypeFilter;
      const nextSubjectId = patch.subjectId ?? base.subjectId;

      const p = new URLSearchParams(searchParams.toString());
      if (nextExamId != null) p.set("exam", String(nextExamId));
      else p.delete("exam");
      p.set("tab", nextTab);

      if (syncSubjectInUrl) {
        if (nextSubjectType !== "all") p.set("subject_type", nextSubjectType);
        else p.delete("subject_type");
        if (nextSubjectId.trim()) p.set("subject", nextSubjectId.trim());
        else p.delete("subject");
      }

      const qs = p.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [activeTab, examId, pathname, router, searchParams, subjectId, subjectTypeFilter, syncSubjectInUrl],
  );

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
    const nextSubjectType = syncSubjectInUrl
      ? parseScriptControlSubjectTypeFilter(searchParams.get("subject_type"))
      : "all";
    const rawSubject = searchParams.get("subject")?.trim() ?? "";

    setExamId(nextExamId);
    setActiveTab(nextTab);
    if (syncSubjectInUrl) {
      setSubjectTypeFilter(nextSubjectType);
      setSubjectId(rawSubject);
    }

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
  }, [exams, pathname, router, searchParams, syncSubjectInUrl]);

  useEffect(() => {
    if (exams.length === 0) return;
    if (requireExamSelection) return;
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

      writeUrl(
        { examId: resolvedId, tab: nextTab },
        {
          replace: true,
          base: {
            examId: resolvedId,
            tab: nextTab,
            subjectTypeFilter,
            subjectId,
          },
        },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    exams,
    pathname,
    requireExamSelection,
    router,
    searchParams,
    singleExamMode,
    subjectId,
    subjectTypeFilter,
    writeUrl,
  ]);

  const setExamIdPush = useCallback(
    (id: number | null) => {
      setExamId(id);
      if (id == null) {
        setSubjectId("");
        setSubjectTypeFilter("all");
      }
      writeUrl({
        examId: id,
        tab: activeTab,
        subjectTypeFilter: id == null ? "all" : subjectTypeFilter,
        subjectId: id == null ? "" : subjectId,
      });
    },
    [activeTab, subjectId, subjectTypeFilter, writeUrl],
  );

  const setActiveTabPush = useCallback(
    (tab: ExaminersTab) => {
      setActiveTab(tab);
      writeUrl({ tab });
    },
    [writeUrl],
  );

  const setSubjectTypeFilterPush = useCallback(
    (value: ScriptControlSubjectTypeFilter) => {
      setSubjectTypeFilter(value);
      setSubjectId("");
      writeUrl({ subjectTypeFilter: value, subjectId: "" });
    },
    [writeUrl],
  );

  const setSubjectIdPush = useCallback(
    (value: string) => {
      setSubjectId(value);
      writeUrl({ subjectId: value });
    },
    [writeUrl],
  );

  return {
    examId,
    activeTab,
    subjectTypeFilter,
    subjectId,
    setExamId: setExamIdPush,
    setActiveTab: setActiveTabPush,
    setSubjectTypeFilter: setSubjectTypeFilterPush,
    setSubjectId: setSubjectIdPush,
  };
}
