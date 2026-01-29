"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect to application flow. Dashboard removed per plan; landing is application or profile. */
export default function DashboardRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/application");
  }, [router]);
  return <div className="p-6">Redirecting…</div>;
}
