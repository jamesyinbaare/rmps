"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect to unified application flow. No separate "New Application" entry point. */
export default function NewApplicationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/application");
  }, [router]);
  return <div className="p-6">Redirecting…</div>;
}
