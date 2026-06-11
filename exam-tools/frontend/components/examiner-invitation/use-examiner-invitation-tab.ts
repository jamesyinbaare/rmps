"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseExaminerInvitationTab, type ExaminerInvitationTab } from "@/components/examiner-invitation/types";

type Options = {
  isAccepted: boolean;
};

export function useExaminerInvitationTab({ isAccepted }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  const [activeTab, setActiveTab] = useState<ExaminerInvitationTab>("landing");

  useEffect(() => {
    const rawTab = searchParams.get("tab");
    let nextTab = parseExaminerInvitationTab(rawTab);
    if (nextTab === "profile" && !isAccepted) {
      nextTab = "landing";
    }

    setActiveTab(nextTab);

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      if (rawTab !== nextTab) {
        const p = new URLSearchParams(searchParams.toString());
        p.set("tab", nextTab);
        const qs = p.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    }
  }, [isAccepted, pathname, router, searchParams]);

  const pushUrl = useCallback(
    (nextTab: ExaminerInvitationTab) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", nextTab);
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setActiveTabPush = useCallback(
    (tab: ExaminerInvitationTab) => {
      if (tab === "profile" && !isAccepted) return;
      setActiveTab(tab);
      pushUrl(tab);
    },
    [isAccepted, pushUrl],
  );

  return {
    activeTab,
    setActiveTab: setActiveTabPush,
  };
}
