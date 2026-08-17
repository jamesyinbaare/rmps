"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type SubjectOfficerAllocationsTab = "figures" | "examiner";

function parseTab(raw: string | null): SubjectOfficerAllocationsTab {
  return raw === "examiner" ? "examiner" : "figures";
}

export function useSubjectOfficerAllocationsUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  const [examinerId, setExaminerIdState] = useState<string | null>(null);
  const [tab, setTabState] = useState<SubjectOfficerAllocationsTab>("figures");

  useEffect(() => {
    setExaminerIdState(searchParams.get("examiner")?.trim() || null);
    setTabState(parseTab(searchParams.get("tab")));
    hydratedRef.current = true;
  }, [searchParams]);

  const writeUrl = useCallback(
    (next: { examinerId?: string | null; tab?: SubjectOfficerAllocationsTab }) => {
      const p = new URLSearchParams(searchParams.toString());
      const nextExaminer = next.examinerId !== undefined ? next.examinerId : examinerId;
      const nextTab = next.tab !== undefined ? next.tab : tab;
      if (nextExaminer) p.set("examiner", nextExaminer);
      else p.delete("examiner");
      if (nextTab === "examiner") p.set("tab", "examiner");
      else p.delete("tab");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [examinerId, pathname, router, searchParams, tab],
  );

  const setExaminerId = useCallback(
    (next: string | null) => {
      setExaminerIdState(next);
      writeUrl({ examinerId: next });
    },
    [writeUrl],
  );

  const setTab = useCallback(
    (next: SubjectOfficerAllocationsTab) => {
      setTabState(next);
      writeUrl({ tab: next });
    },
    [writeUrl],
  );

  return { examinerId, setExaminerId, tab, setTab, ready: hydratedRef.current };
}
