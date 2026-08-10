"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy Missing Sheets page — redirects to Track ICMS (missing tab).
 */
export default function MissingSheetsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "missing");
    const qs = params.toString();
    router.replace(`/icm-studio/track-icms${qs ? `?${qs}` : "?tab=missing"}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Redirecting to Track ICMS…
    </div>
  );
}
