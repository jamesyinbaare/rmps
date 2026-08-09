"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { DataEntryOpsHeader } from "@/components/DataEntryOpsHeader";
import { PrepareBatchesPanel } from "@/components/PrepareBatchesPanel";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { getBatchSummary } from "@/lib/api";
import { useDataEntryExamScope } from "@/hooks/useDataEntryExamScope";
import type { BatchSummaryResponse } from "@/types/document";

export default function PrepareBatchesPage() {
  const { loading, authorized, exams, subjects, examId, applyExamId } =
    useDataEntryExamScope({ path: "/clerk/batches" });
  const [summary, setSummary] = useState<BatchSummaryResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const summaryData = await getBatchSummary(examId || undefined);
      setSummary(summaryData);
    } finally {
      setRefreshing(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!authorized) return;
    void refresh().catch((err) =>
      toast.error(err instanceof Error ? err.message : "Failed to refresh")
    );
  }, [authorized, refresh]);

  if (loading) {
    return (
      <DashboardLayout title="Prepare Batches">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  return (
    <DashboardLayout title="Prepare Batches">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Prepare Batches" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6">
            <DataEntryOpsHeader
              title="Prepare Batches"
              description="Validate scores, optionally clear existing packs, then create DOC and/or NOD batches for assignment."
              exams={exams}
              examId={examId}
              onExamIdChange={applyExamId}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={refreshing}
                  onClick={() =>
                    void refresh().catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Refresh failed")
                    )
                  }
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              }
            />

            {!examId ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select an examination to prepare batches.
              </div>
            ) : (
              <PrepareBatchesPanel
                exams={exams}
                subjects={subjects}
                examId={examId}
                onExamIdChange={applyExamId}
                unbatched={summary?.unbatched ?? []}
                onChanged={refresh}
                hideExamSelect
              />
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
