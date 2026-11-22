"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { FeesInvoicesWorkspace } from "@/components/fees/FeesInvoicesWorkspace";

export default function SchoolFeesExamDetailPage() {
  const params = useParams();
  const router = useRouter();

  const examId = useMemo(() => {
    const raw = params?.examId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = value ? parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [params]);

  useEffect(() => {
    if (examId === null) {
      router.replace("/dashboard/my-school/fees");
    }
  }, [examId, router]);

  if (examId === null) {
    return null;
  }

  return (
    <FeesInvoicesWorkspace
      mode="school"
      lockedExamId={examId}
      backHref="/dashboard/my-school/fees"
      backLabel="Fees"
    />
  );
}
