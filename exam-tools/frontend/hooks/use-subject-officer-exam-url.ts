"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Options = {
  examIds: number[];
  /** When true, never auto-select the only available examination. */
  requireSelection?: boolean;
};

export function useSubjectOfficerExamUrl({ examIds, requireSelection = true }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const examIdFromUrl = useMemo(() => {
    const raw = searchParams.get("exam");
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || !examIds.includes(parsed)) return null;
    return parsed;
  }, [examIds, searchParams]);

  const [examId, setExamIdState] = useState<number | null>(examIdFromUrl);

  useEffect(() => {
    setExamIdState(examIdFromUrl);
  }, [examIdFromUrl]);

  const setExamId = useCallback(
    (id: number | null) => {
      setExamIdState(id);
      const p = new URLSearchParams(searchParams.toString());
      if (id != null) p.set("exam", String(id));
      else p.delete("exam");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    examId: requireSelection ? examId : examId ?? (examIds.length === 1 ? examIds[0]! : null),
    setExamId,
    hasExplicitSelection: examIdFromUrl != null,
  };
}
