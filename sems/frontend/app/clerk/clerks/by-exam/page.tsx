"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";

/** By-exam roster merged into Manage Clerks exam filter. */
export default function ClerksByExamRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const examId = searchParams.get("exam_id");
    const href = examId
      ? `/clerk/clerks?exam_id=${encodeURIComponent(examId)}`
      : "/clerk/clerks";
    router.replace(href);
  }, [router, searchParams]);

  return (
    <DashboardLayout title="Manage Clerks">
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );
}
