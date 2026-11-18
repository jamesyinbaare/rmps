"use client";

import { useEffect, useState } from "react";
import { getSchoolDashboard, getCurrentUser, listAllSchoolExams, listSchoolCandidates } from "@/lib/api";
import type { SchoolDashboardData } from "@/lib/api";
import type { User, RegistrationExam } from "@/types";
import { Users, AlertCircle, BookOpen, Calendar, CheckCircle2, UserPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { StatStrip } from "@/components/dashboard/StatStrip";

export default function MySchoolDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboardData, setDashboardData] = useState<SchoolDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeExams, setActiveExams] = useState<RegistrationExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examCandidateCounts, setExamCandidateCounts] = useState<Record<number, { total: number; approved: number }>>({});
  const [examCandidates, setExamCandidates] = useState<Record<number, any[]>>({});
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [programmesMap, setProgrammesMap] = useState<Record<number, { id: number; code: string; name: string }>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, dashboard] = await Promise.all([
          getCurrentUser(),
          getSchoolDashboard(),
        ]);
        setUser(userData);
        setDashboardData(dashboard);

        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Dashboard`;
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const loadActiveExams = async () => {
      setLoadingExams(true);
      try {
        const allExams = await listAllSchoolExams();
        const now = new Date();

        const active = allExams.filter(exam => {
          if (!exam.registration_period) return false;
          const startDate = new Date(exam.registration_period.registration_start_date);
          const endDate = new Date(exam.registration_period.registration_end_date);
          return exam.registration_period.is_active &&
                 startDate <= now &&
                 endDate >= now &&
                 exam.registration_period.allows_bulk_registration;
        });

        setActiveExams(active);

        const counts: Record<number, { total: number; approved: number }> = {};
        const candidatesData: Record<number, any[]> = {};
        const programmesInfo: Record<number, { id: number; code: string; name: string }> = {};

        if (dashboardData?.programmes_summary) {
          for (const prog of dashboardData.programmes_summary) {
            programmesInfo[prog.id] = { id: prog.id, code: prog.code, name: prog.name };
          }
        }

        for (const exam of active) {
          try {
            const candidates = await listSchoolCandidates(exam.id);
            candidatesData[exam.id] = candidates;
            const total = candidates.length;
            const approved = candidates.filter(c => c.registration_status === "APPROVED").length;
            counts[exam.id] = { total, approved };

            for (const candidate of candidates) {
              if (candidate.programme_id && candidate.programme_code && !programmesInfo[candidate.programme_id]) {
                programmesInfo[candidate.programme_id] = {
                  id: candidate.programme_id,
                  code: candidate.programme_code,
                  name: candidate.programme_code,
                };
              }
            }
          } catch (error) {
            console.error(`Failed to load candidates for exam ${exam.id}:`, error);
            counts[exam.id] = { total: 0, approved: 0 };
            candidatesData[exam.id] = [];
          }
        }

        setExamCandidateCounts(counts);
        setExamCandidates(candidatesData);
        setProgrammesMap(programmesInfo);

        if (active.length > 0 && !selectedExamId) {
          setSelectedExamId(active[0].id);
        }
      } catch (error) {
        console.error("Failed to load active exams:", error);
      } finally {
        setLoadingExams(false);
      }
    };

    if (!loading && dashboardData) {
      loadActiveExams();
    }
  }, [loading, dashboardData]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Failed to load dashboard data</div>
      </div>
    );
  }

  const isAtUserLimit = dashboardData.active_user_count >= dashboardData.max_active_users;

  const getCompletionPercentage = (exam: RegistrationExam) => {
    const counts = examCandidateCounts[exam.id] || { total: 0, approved: 0 };
    if (!counts.total || counts.total === 0) return 0;
    return Math.round((counts.approved / counts.total) * 100 * 10) / 10;
  };

  const getProgrammesSummaryForExam = (examId: number | null) => {
    if (!examId || !examCandidates[examId]) return [];

    const candidates = examCandidates[examId];
    const programmeStats: Record<number, { total: number; approved: number }> = {};

    for (const candidate of candidates) {
      const progId = candidate.programme_id;
      if (!progId) continue;

      if (!programmeStats[progId]) {
        programmeStats[progId] = { total: 0, approved: 0 };
      }

      programmeStats[progId].total++;
      if (candidate.registration_status === "APPROVED") {
        programmeStats[progId].approved++;
      }
    }

    return Object.entries(programmeStats)
      .map(([progIdStr, stats]) => {
        const progId = parseInt(progIdStr);
        const progInfo = programmesMap[progId] || { id: progId, code: `Programme ${progId}`, name: `Programme ${progId}` };
        return {
          id: progId,
          code: progInfo.code,
          name: progInfo.name,
          total_candidates: stats.total,
          completed_candidates: stats.approved,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  const selectedExamProgrammes = selectedExamId ? getProgrammesSummaryForExam(selectedExamId) : [];

  const schoolName = dashboardData.school.name;

  const examTitleOf = (exam: RegistrationExam) =>
    `${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}`;

  const selectedExam = selectedExamId
    ? activeExams.find((e) => e.id === selectedExamId) ?? null
    : null;
  const selectedCounts = selectedExamId
    ? examCandidateCounts[selectedExamId] || { total: 0, approved: 0 }
    : { total: 0, approved: 0 };
  const selectedPct = selectedExam ? getCompletionPercentage(selectedExam) : 0;

  let daysToClose: number | null = null;
  if (selectedExam?.registration_period?.registration_end_date) {
    const endDate = new Date(selectedExam.registration_period.registration_end_date);
    const diffDays = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    daysToClose = diffDays > 0 ? diffDays : 0;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={schoolName || "Home"}
        subtitle="Manage registrations, candidates, and progress for active examinations."
        actions={
          <>
            <Link href="/dashboard/my-school/register">
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Register candidates
              </Button>
            </Link>
            <Link href="/dashboard/my-school/profile">
              <Button variant="outline">School profile</Button>
            </Link>
          </>
        }
      />

      {!dashboardData.school.profile_completed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <strong>Complete your school profile</strong>
              <p className="mt-1">
                Please complete your school profile to access all features. All profile fields are
                required.
              </p>
            </div>
            <Link href="/dashboard/my-school/profile">
              <Button size="sm" variant="outline" className="ml-4">
                Complete Profile
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {user?.role === "SchoolAdmin" && isAtUserLimit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have reached the maximum of {dashboardData.max_active_users} active users. Please
            deactivate an existing user before creating a new one.
          </AlertDescription>
        </Alert>
      )}

      <StatStrip
        items={[
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Candidates
              </span>
            ),
            value: selectedExam ? (
              <span className="inline-flex items-baseline gap-2">
                <span>{selectedCounts.total.toLocaleString()}</span>
                <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
                  / {selectedCounts.approved.toLocaleString()} approved
                </span>
              </span>
            ) : (
              "—"
            ),
            hint: selectedExam ? examTitleOf(selectedExam) : "Select an examination",
          },
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completion
              </span>
            ),
            value: selectedExam ? `${selectedPct}%` : "—",
            hint: selectedExam ? (
              <Progress value={selectedPct} className="mt-2 h-1.5" />
            ) : (
              "No exam selected"
            ),
          },
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Registration window
              </span>
            ),
            value:
              daysToClose === null ? (
                "—"
              ) : (
                <span className="inline-flex items-baseline gap-2">
                  <span className={daysToClose <= 7 ? "text-warning" : undefined}>
                    {daysToClose === 0 ? "0" : daysToClose.toLocaleString()}
                  </span>
                  <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
                    {daysToClose === 0 ? "closes today" : "days left"}
                  </span>
                </span>
              ),
            hint: selectedExam ? (
              <Link
                href={`/dashboard/my-school/register?exam_id=${selectedExam.id}`}
                className="text-primary hover:underline"
              >
                Continue registration
              </Link>
            ) : (
              "—"
            ),
          },
        ]}
      />

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel>Active examinations</SectionLabel>

          {loadingExams ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
              ))}
            </div>
          ) : activeExams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No active examinations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                There are no active examinations at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeExams.map((exam) => {
                const pct = getCompletionPercentage(exam);
                const counts = examCandidateCounts[exam.id] || { total: 0, approved: 0 };
                const isSelected = selectedExamId === exam.id;

                return (
                  <div
                    key={exam.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedExamId(exam.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedExamId(exam.id);
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors duration-150 ${
                      isSelected
                        ? "border-primary bg-accent/40 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{examTitleOf(exam)}</p>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-success/30 bg-success/10 text-success"
                        >
                          Active
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {counts.total.toLocaleString()} candidates · {pct}% complete
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/my-school/register?exam_id=${exam.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="outline" size="sm">
                        Details
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel>
            Programmes
            {selectedExamId ? ` (${selectedExamProgrammes.length})` : ""}
          </SectionLabel>

          {!selectedExamId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select an examination to view programmes summary.
            </p>
          ) : selectedExamProgrammes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No programmes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No candidates registered for programmes in this examination yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedExamProgrammes.map((programme) => {
                const pct =
                  programme.total_candidates > 0
                    ? Math.round(
                        (programme.completed_candidates / programme.total_candidates) * 100
                      )
                    : 0;

                return (
                  <Link
                    key={programme.id}
                    href={`/dashboard/my-school/register?exam_id=${selectedExamId}&programme_id=${programme.id}`}
                    className="flex items-center gap-2.5 rounded-md border border-border p-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="truncate text-sm font-medium text-primary">
                          {programme.name}
                        </h4>
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 py-0 text-xs">
                          {programme.code}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">
                            {programme.total_candidates}
                          </span>{" "}
                          registered
                        </span>
                        <span>•</span>
                        <span>
                          <span className="font-medium text-success">
                            {programme.completed_candidates}
                          </span>{" "}
                          completed
                        </span>
                      </div>
                      {programme.total_candidates > 0 ? (
                        <Progress value={pct} className="mt-1.5 h-1" />
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
