"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

/** Redirect legacy /admin/cycles/[id] to examinations (no direct mapping from cycle id to subject_examiner id). */
export default function AdminCycleDetailRedirectPage() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    router.replace("/dashboard/admin/examinations");
  }, [router, params.id]);
  return null;
}
