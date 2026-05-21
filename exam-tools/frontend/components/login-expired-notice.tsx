"use client";

import { Suspense } from "react";

import { SessionExpiredBanner } from "@/components/session-expired-banner";
import { useSessionExpiredNotice } from "@/hooks/use-session-expired-notice";

function LoginExpiredNoticeInner() {
  const show = useSessionExpiredNotice();
  return <SessionExpiredBanner show={show} />;
}

/** Session-expired banner for login pages (requires Suspense for search params). */
export function LoginExpiredNotice() {
  return (
    <Suspense fallback={null}>
      <LoginExpiredNoticeInner />
    </Suspense>
  );
}
