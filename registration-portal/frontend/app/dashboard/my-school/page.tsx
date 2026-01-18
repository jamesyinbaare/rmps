"use client";

import { useEffect, useState } from "react";
import { getSchoolDashboard, getCurrentUser, listAllSchoolExams, listSchoolCandidates } from "@/lib/api";
import type { SchoolDashboardData } from "@/lib/api";
import type { User, RegistrationExam } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, UserPlus, AlertCircle, BookOpen, Calendar, CheckCircle2, Building2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";

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

        // Update page title with school name
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
        // Get all exams (active and inactive) to find current active ones
        const allExams = await listAllSchoolExams();
        const now = new Date();

        // Filter for currently active exams based on registration period
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

        // Load candidates for each active exam
        const counts: Record<number, { total: number; approved: number }> = {};
        const candidatesData: Record<number, any[]> = {};
        const programmesInfo: Record<number, { id: number; code: string; name: string }> = {};

        // Build programmes map from dashboard data
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

            // Build programmes map from candidates (in case some programmes aren't in dashboard summary)
            for (const candidate of candidates) {
              if (candidate.programme_id && candidate.programme_code && !programmesInfo[candidate.programme_id]) {
                programmesInfo[candidate.programme_id] = {
                  id: candidate.programme_id,
                  code: candidate.programme_code,
                  name: candidate.programme_code, // Fallback to code if name not available
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

        // Auto-select first exam if available
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
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Failed to load dashboard data</div>
      </div>
    );
  }

  const isAtUserLimit = dashboardData.active_user_count >= dashboardData.max_active_users;
  const userSlotsRemaining = dashboardData.max_active_users - dashboardData.active_user_count;

  const getCompletionPercentage = (exam: RegistrationExam) => {
    const counts = examCandidateCounts[exam.id] || { total: 0, approved: 0 };
    if (!counts.total || counts.total === 0) return 0;
    return Math.round((counts.approved / counts.total) * 100 * 10) / 10;
  };

  // Calculate programme summary for selected exam
  const getProgrammesSummaryForExam = (examId: number | null) => {
    if (!examId || !examCandidates[examId]) return [];

    const candidates = examCandidates[examId];
    const programmeStats: Record<number, { total: number; approved: number }> = {};

    // Count candidates by programme
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

    // Convert to array format with programme info
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

  return (
    <div className="space-y-6 max-w-8xl mx-auto">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">My School Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.full_name || "User"}
        </p>
      </div>

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

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column - Active Examinations */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle>Active Examinations</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto min-h-0">
            {loadingExams ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Skeleton className="h-4 w-20 mb-2" />
                          <Skeleton className="h-8 w-16" />
                        </div>
                        <div>
                          <Skeleton className="h-4 w-20 mb-2" />
                          <Skeleton className="h-8 w-16" />
                        </div>
                      </div>
                      <div className="pt-2">
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <Skeleton className="h-10 w-full rounded-md" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : activeExams.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Calendar className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Active Examinations</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  There are no active examinations at this time.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeExams.map((exam) => {
                  const completionPercentage = getCompletionPercentage(exam);
                  const counts = examCandidateCounts[exam.id] || { total: 0, approved: 0 };
                  const examTitle = `${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}`;

                  const isSelected = selectedExamId === exam.id;

                  // Calculate days until registration closes
                  const getDaysToClose = () => {
                    if (!exam.registration_period?.registration_end_date) return null;
                    const endDate = new Date(exam.registration_period.registration_end_date);
                    const now = new Date();
                    const diffTime = endDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays > 0 ? diffDays : 0;
                  };

                  const daysToClose = getDaysToClose();

                  return (
                    <Card
                      key={exam.id}
                      className={`transition-all duration-200 cursor-pointer border-2 ${
                        isSelected
                          ? "border-primary shadow-lg"
                          : "hover:border-primary/50 hover:shadow-md"
                      }`}
                      onClick={() => setSelectedExamId(exam.id)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg font-semibold line-clamp-2">
                            {examTitle}
                          </CardTitle>
                          <Badge variant="default" className="bg-green-500 text-white shrink-0 ml-2">
                            Active
                          </Badge>
                        </div>
                        {exam.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{exam.description}</p>
                        )}
                        {daysToClose !== null && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <Calendar className="inline h-3 w-3 mr-1" />
                            {daysToClose === 0
                              ? "Registration closes today"
                              : daysToClose === 1
                              ? "Registration closes in 1 day"
                              : `Registration closes in ${daysToClose} days`}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Progress Visualization */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Completion</span>
                              <span className="font-semibold">{completionPercentage}%</span>
                            </div>
                            <Progress value={completionPercentage} className="h-2" />
                          </div>
                          <ProgressRing
                            value={completionPercentage}
                            size={56}
                            strokeWidth={6}
                            color="hsl(var(--primary))"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Candidates</p>
                              <p className="text-xl font-bold">{counts.total}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Approved</p>
                              <p className="text-xl font-bold">{counts.approved}</p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <Link href={`/dashboard/my-school/register?exam_id=${exam.id}`} onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" className="w-full">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column - Programmes Summary */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="shrink-0">
            <CardTitle>
              Programmes Summary
              {selectedExamId && ` (${selectedExamProgrammes.length})`}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto min-h-0">
            {!selectedExamId ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <BookOpen className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Select an Examination</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select an examination from the left to view programmes summary
                </p>
              </div>
            ) : selectedExamProgrammes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <BookOpen className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Programmes</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  No candidates registered for programmes in this examination yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedExamProgrammes.map((programme) => {
                  const completionPercentage = programme.total_candidates > 0
                    ? Math.round((programme.completed_candidates / programme.total_candidates) * 100)
                    : 0;

                  return (
                    <Link
                      key={programme.id}
                      href={`/dashboard/my-school/register?exam_id=${selectedExamId}&programme_id=${programme.id}`}
                      className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      {/* Programme Icon */}
                      <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>

                      {/* Programme Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-primary truncate">{programme.name}</h4>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {programme.code}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Registered</span>
                            <span className="font-semibold">{programme.total_candidates}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Completed</span>
                            <span className="font-semibold text-green-600">{programme.completed_candidates}</span>
                          </div>
                          {programme.total_candidates > 0 && (
                            <Progress value={completionPercentage} className="h-1.5 mt-2" />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
