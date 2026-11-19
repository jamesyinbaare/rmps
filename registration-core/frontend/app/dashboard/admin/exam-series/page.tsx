"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ExamSeriesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/exams?tab=series");
  }, [router]);

  return (
    <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">
      Redirecting to Examinations…
    </div>
  );
}
