"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function useSubjectOfficerAllocationsUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  const [examinerId, setExaminerIdState] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("examiner")?.trim() || null;
    setExaminerIdState(raw);
    hydratedRef.current = true;
  }, [searchParams]);

  const setExaminerId = useCallback(
    (next: string | null) => {
      setExaminerIdState(next);
      const p = new URLSearchParams(searchParams.toString());
      if (next) p.set("examiner", next);
      else p.delete("examiner");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { examinerId, setExaminerId, ready: hydratedRef.current };
}
