"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Copy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSchoolExamExpectations,
  updateSchoolExamExpectations,
} from "@/lib/api";
import type { RegistrationCandidate, SchoolExamExpectations } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExamRegistrationPulse } from "@/components/school/ExamRegistrationPulse";
import { ExpectationsEditDialog } from "@/components/school/ExpectationsEditDialog";
import { ExpectationsProgrammeWorkbench } from "@/components/school/ExpectationsProgrammeWorkbench";
import { SchoolExamCandidatesTable } from "@/components/school/SchoolExamCandidatesTable";
import { cn } from "@/lib/utils";

export type WorkbenchTab = "programme" | "candidates";

interface CandidateStats {
  total: number;
  complete: number;
  incomplete: number;
}

interface ExamRegistrationWorkspaceProps {
  examId: number;
  onExpectationsUpdated?: (data: SchoolExamExpectations) => void;
  candidates: RegistrationCandidate[];
  loadingCandidates: boolean;
  candidatesLoaded: boolean;
  candidateStats: CandidateStats;
  tab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  candidatePageIndex: number;
  candidatePageSize: number;
  onCandidatePaginationChange: (pageIndex: number, pageSize: number) => void;
  onCandidatesTabOpen: () => void;
  onCandidateRowClick: (candidate: RegistrationCandidate) => void;
  onFilteredChange: (candidates: RegistrationCandidate[]) => void;
  className?: string;
}

export function ExamRegistrationWorkspace({
  examId,
  onExpectationsUpdated,
  candidates,
  loadingCandidates,
  candidatesLoaded,
  candidateStats,
  tab,
  onTabChange,
  candidatePageIndex,
  candidatePageSize,
  onCandidatePaginationChange,
  onCandidatesTabOpen,
  onCandidateRowClick,
  onFilteredChange,
  className,
}: ExamRegistrationWorkspaceProps) {
  const [data, setData] = useState<SchoolExamExpectations | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await getSchoolExamExpectations(examId);
        if (cancelled) return;
        setData(result);
        onExpectationsUpdated?.(result);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        toast.error("Failed to load expected registration counts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // Intentionally omit onExpectationsUpdated — parents often pass an inline callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const handleSave = async (payload: {
    expected_total: number | null;
    programmes: { programme_id: number; expected_count: number }[];
  }) => {
    setSaving(true);
    try {
      const result = await updateSchoolExamExpectations(examId, payload);
      setData(result);
      onExpectationsUpdated?.(result);
      setDialogOpen(false);
      toast.success(
        result.has_declaration
          ? "Expected numbers saved"
          : "Expected numbers cleared"
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save expected numbers"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const result = await updateSchoolExamExpectations(examId, {
        expected_total: null,
        programmes: [],
      });
      setData(result);
      onExpectationsUpdated?.(result);
      setDialogOpen(false);
      toast.success("Expected numbers cleared");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to clear expected numbers"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTabChange = (value: string) => {
    const next = value as WorkbenchTab;
    onTabChange(next);
    if (next === "candidates") {
      onCandidatesTabOpen();
    }
  };

  return (
    <div className={cn("space-y-5", className)}>
      <ExamRegistrationPulse
        data={data}
        loading={loading}
        onEdit={data?.can_edit ? () => setDialogOpen(true) : undefined}
      />

      <div className="rounded-lg border border-border bg-card">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <div className="border-b border-border px-4 pt-3 md:px-5">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="programme">By programme</TabsTrigger>
              <TabsTrigger value="candidates">
                Candidates
                {data != null && data.actual_total > 0
                  ? ` (${data.actual_total.toLocaleString()})`
                  : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="programme" className="mt-0 focus-visible:ring-0">
            {data ? (
              <ExpectationsProgrammeWorkbench
                data={data}
                onEdit={() => setDialogOpen(true)}
              />
            ) : loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading programme progress…
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="candidates" className="mt-0 focus-visible:ring-0">
            <div className="space-y-4 p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-mono tabular-nums text-foreground">
                      {candidatesLoaded && !loadingCandidates
                        ? candidateStats.total.toLocaleString()
                        : "—"}
                    </span>{" "}
                    registered
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="font-mono tabular-nums text-foreground">
                      {candidatesLoaded && !loadingCandidates
                        ? candidateStats.complete.toLocaleString()
                        : "—"}
                    </span>{" "}
                    complete
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="font-mono tabular-nums text-foreground">
                      {candidatesLoaded && !loadingCandidates
                        ? candidateStats.incomplete.toLocaleString()
                        : "—"}
                    </span>{" "}
                    incomplete
                  </span>
                </div>
                <Button variant="ghost" size="sm" asChild className="h-8">
                  <Link href={`/dashboard/my-school/register/${examId}/duplicates`}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Find duplicates
                  </Link>
                </Button>
              </div>
              <SchoolExamCandidatesTable
                candidates={candidates}
                loading={loadingCandidates}
                onRowClick={onCandidateRowClick}
                onFilteredChange={onFilteredChange}
                pageIndex={candidatePageIndex}
                pageSize={candidatePageSize}
                onPaginationChange={onCandidatePaginationChange}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {data && (
        <ExpectationsEditDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          data={data}
          saving={saving}
          onSave={handleSave}
          onClear={handleClear}
        />
      )}
    </div>
  );
}
