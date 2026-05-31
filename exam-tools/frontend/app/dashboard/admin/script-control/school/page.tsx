"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Backward-compatible redirect from /script-control/school → /script-control/edit */
export default function ScriptControlSchoolRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/dashboard/admin/script-control/edit${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return <p className="text-sm text-muted-foreground">Redirecting to edit mode…</p>;
}
