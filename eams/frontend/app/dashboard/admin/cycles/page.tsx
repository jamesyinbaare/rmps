"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect legacy /admin/cycles to the new examinations list. */
export default function AdminCyclesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/examinations");
  }, [router]);
  return null;
}
