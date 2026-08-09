"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { DataEntryOpsHeader } from "@/components/DataEntryOpsHeader";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getBatchSummary,
  getClerkDigitalEntrySetting,
  setClerkDigitalEntrySetting,
} from "@/lib/api";
import { useDataEntryExamScope } from "@/hooks/useDataEntryExamScope";
import type { BatchSummaryResponse } from "@/types/document";

export default function OverviewPage() {
  const { loading, authorized, exams, examId, applyExamId } = useDataEntryExamScope({
    path: "/clerk/manage",
  });
  const [summary, setSummary] = useState<BatchSummaryResponse | null>(null);
  const [clerkDigitalEntryEnabled, setClerkDigitalEntryEnabled] = useState(false);
  const [savingDigitalEntry, setSavingDigitalEntry] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [digitalLoaded, setDigitalLoaded] = useState(false);

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

  useEffect(() => {
    if (!authorized || digitalLoaded) return;
    void getClerkDigitalEntrySetting()
      .then((digital) => {
        setClerkDigitalEntryEnabled(digital.enabled);
        setDigitalLoaded(true);
      })
      .catch(() => {
        setClerkDigitalEntryEnabled(false);
        setDigitalLoaded(true);
      });
  }, [authorized, digitalLoaded]);

  const handleToggleDigital = async (enabled: boolean) => {
    const previous = clerkDigitalEntryEnabled;
    setClerkDigitalEntryEnabled(enabled);
    setSavingDigitalEntry(true);
    try {
      const updated = await setClerkDigitalEntrySetting(enabled);
      setClerkDigitalEntryEnabled(updated.enabled);
      toast.success(
        updated.enabled
          ? "Dataclerks can use digital entry"
          : "Digital entry disabled for dataclerks"
      );
    } catch (err) {
      setClerkDigitalEntryEnabled(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSavingDigitalEntry(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Overview">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  const unbatched = summary?.pending_unbatched ?? 0;
  const unassigned = summary?.batch_count_unassigned ?? 0;
  const clerksWithWork = summary?.clerks_with_work ?? 0;
  const assignedPending = summary?.pending_assigned ?? 0;

  const kpis = [
    { label: "Unbatched pending", value: unbatched },
    { label: "Unassigned batches", value: unassigned },
    { label: "Assigned pending", value: assignedPending },
    { label: "Resolved in exam", value: summary?.resolved_in_exam ?? 0 },
    { label: "Clerks with work", value: clerksWithWork },
  ];

  const examQs = examId ? `?exam_id=${examId}` : "";
  const nextActions = [
    {
      key: "prepare",
      title: "Prepare batches",
      description:
        unbatched > 0
          ? `${unbatched} pending issue(s) still unbatched.`
          : "Validate and pack pending issues into DOC/NOD batches.",
      href: `/clerk/batches${examQs}`,
      emphasize: unbatched > 0,
    },
    {
      key: "assign",
      title: "Assign work",
      description:
        unassigned > 0
          ? `${unassigned} batch(es) waiting for a clerk.`
          : "Dispatch unassigned batches to dataclerks.",
      href: `/clerk/assign${examQs}`,
      emphasize: unassigned > 0,
    },
    {
      key: "clerks",
      title: "Manage clerks",
      description:
        clerksWithWork > 0
          ? `${clerksWithWork} clerk(s) have active work · ${assignedPending} pending.`
          : "Create clerks and monitor assignments and resolutions.",
      href: `/clerk/clerks${examQs}`,
      emphasize: clerksWithWork > 0,
    },
  ];

  return (
    <DashboardLayout title="Overview">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Overview" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6">
            <DataEntryOpsHeader
              title="Overview"
              description="Monitor one examination, then prepare batches, assign work, or manage clerks."
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
                Select an examination to see KPIs and next actions.
              </div>
            ) : (
              <>
                <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {kpis.map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-xl border bg-muted/20 px-4 py-3"
                    >
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-semibold tabular-nums mt-1">
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="font-medium">Next actions</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Follow the ops flow for this examination
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {nextActions.map((action) => (
                      <Link
                        key={action.key}
                        href={action.href}
                        className={
                          action.emphasize
                            ? "rounded-xl border border-foreground/20 bg-muted/30 px-4 py-4 transition-colors hover:bg-muted/50"
                            : "rounded-xl border bg-muted/10 px-4 py-4 transition-colors hover:bg-muted/30"
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{action.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {action.description}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border bg-muted/20 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label htmlFor="clerk-digital-entry" className="text-sm font-medium">
                      Allow dataclerks digital entry
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When on, clerks see Digital and can edit scores on assigned sheets.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingDigitalEntry && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      id="clerk-digital-entry"
                      checked={clerkDigitalEntryEnabled}
                      disabled={savingDigitalEntry}
                      onCheckedChange={(checked) => {
                        void handleToggleDigital(checked);
                      }}
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
