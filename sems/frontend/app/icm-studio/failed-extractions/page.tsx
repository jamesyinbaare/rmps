"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy failed-extractions path — redirects to All files Errors tab.
 */
export default function FailedExtractionsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("id_extraction_status", "error");
    const examId = searchParams.get("exam_id");
    const error = searchParams.get("error");
    if (examId) params.set("exam_id", examId);
    if (error) params.set("error", error);
    router.replace(`/icm-studio/documents?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Redirecting to Errors…
    </div>
  );
}
