"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect to new application URL. */
export default function DashboardApplicationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/application");
  }, [router]);
  return <div className="p-6">Redirecting…</div>;
}
