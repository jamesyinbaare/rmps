"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SCRIPTS_ALLOCATION_BASE = "/dashboard/admin/scripts-allocation";

export default function LegacyScriptAllocationRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `${SCRIPTS_ALLOCATION_BASE}?${qs}` : SCRIPTS_ALLOCATION_BASE);
  }, [router, searchParams]);

  return <p className="p-4 text-sm text-muted-foreground">Redirecting…</p>;
}
