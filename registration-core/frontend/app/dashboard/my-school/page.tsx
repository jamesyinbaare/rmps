"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getSchoolDashboard,
  getCurrentUser,
  listAvailableExams,
  listSchoolCandidates,
} from "@/lib/api";
import type { SchoolDashboardData } from "@/lib/api";
import type { User, RegistrationExam } from "@/types";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  Users,
  UserPlus,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { StatStrip } from "@/components/dashboard/StatStrip";
import {
  SchoolExamRegisterCard,
  type ExamRegisterKpis,
} from "@/components/school/SchoolExamRegisterCard";

function isRegistrationOpen(exam: RegistrationExam): boolean {
  if (!exam.registration_period?.is_active) return false;
  const now = new Date();
  const start = new Date(exam.registration_period.registration_start_date);
  const end = new Date(exam.registration_period.registration_end_date);
  return start <= now && end >= now;
}

export default function MySchoolDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboardData, setDashboardData] = useState<SchoolDashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [activeExams, setActiveExams] = useState<RegistrationExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [kpisByExam, setKpisByExam] = useState<
    Record<number, ExamRegisterKpis>
  >({});

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
    if (loading || !dashboardData) return;

    const loadActiveExams = async () => {
      setLoadingExams(true);
      try {
        const examsData = await listAvailableExams();
        const active = examsData.filter(isRegistrationOpen);
        setActiveExams(active);

        const counts: Record<number, ExamRegisterKpis> = {};
        await Promise.all(
          active.map(async (exam) => {
            try {
              const candidates = await listSchoolCandidates(exam.id);
              counts[exam.id] = {
                total: candidates.length,
                approved: candidates.filter(
                  (c) => c.registration_status === "COMPLETE"
                ).length,
                pending: candidates.filter(
                  (c) => c.registration_status === "INCOMPLETE"
                ).length,
              };
            } catch {
              counts[exam.id] = { total: 0, approved: 0, pending: 0 };
            }
          })
        );
        setKpisByExam(counts);
      } catch (error) {
        console.error("Failed to load active exams:", error);
        setActiveExams([]);
        setKpisByExam({});
      } finally {
        setLoadingExams(false);
      }
    };

    loadActiveExams();
  }, [loading, dashboardData]);

  const aggregates = useMemo(() => {
    let candidates = 0;
    let approved = 0;
    let pending = 0;
    for (const exam of activeExams) {
      const k = kpisByExam[exam.id];
      if (!k) continue;
      candidates += k.total;
      approved += k.approved;
      pending += k.pending;
    }
    return { candidates, approved, pending };
  }, [activeExams, kpisByExam]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 border-border p-5 sm:border-l first:border-l-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="space-y-4 rounded-lg border border-border bg-card p-5"
            >
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-20" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-5xl items-center justify-center">
        <div className="text-center text-muted-foreground">
          Failed to load dashboard data
        </div>
      </div>
    );
  }

  const isAtUserLimit =
    dashboardData.active_user_count >= dashboardData.max_active_users;
  const isSchoolAdmin = user?.role === "SchoolAdmin";
  const schoolName = dashboardData.school.name;

  const shortcuts = [
    {
      href: "/dashboard/my-school/examinations",
      label: "Examinations",
      description: "Browse past and current examinations",
      icon: Calendar,
    },
    {
      href: "/dashboard/my-school/photo-album",
      label: "Photo album",
      description: "Manage candidate passport photos",
      icon: Camera,
    },
    {
      href: "/dashboard/my-school/programmes",
      label: "Programmes",
      description: "View programmes available to your school",
      icon: BookOpen,
    },
    ...(isSchoolAdmin
      ? [
          {
            href: "/dashboard/my-school/users",
            label: "Users",
            description: "Manage school staff accounts",
            icon: UserCog,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={schoolName || "Home"}
        subtitle="Manage registrations, candidates, and progress for active examinations."
        actions={
          <>
            <Button asChild>
              <Link href="/dashboard/my-school/register">
                <UserPlus className="mr-2 h-4 w-4" />
                Register candidates
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/my-school/profile">School profile</Link>
            </Button>
          </>
        }
      />

      {!dashboardData.school.profile_completed && (
        <Alert variant="destructive" className="shadow-none">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong>Complete your school profile</strong>
              <p className="mt-1 text-sm">
                Finish your school profile to access all features. All profile
                fields are required.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild className="shrink-0 shadow-none">
              <Link href="/dashboard/my-school/profile">Complete profile</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isSchoolAdmin && isAtUserLimit && (
        <Alert variant="destructive" className="shadow-none">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have reached the maximum of {dashboardData.max_active_users}{" "}
            active users. Deactivate an existing user before creating a new one.
          </AlertDescription>
        </Alert>
      )}

      <StatStrip
        items={[
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Active examinations
              </span>
            ),
            value: loadingExams ? "—" : activeExams.length.toLocaleString(),
            hint: "Open registration windows",
          },
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Candidates
              </span>
            ),
            value: loadingExams
              ? "—"
              : aggregates.candidates.toLocaleString(),
            hint: "Across active examinations",
          },
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete
              </span>
            ),
            value: loadingExams ? "—" : aggregates.approved.toLocaleString(),
            hint: loadingExams
              ? undefined
              : `${aggregates.pending.toLocaleString()} incomplete`,
          },
          isSchoolAdmin
            ? {
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5" />
                    Staff seats
                  </span>
                ),
                value: (
                  <span className="inline-flex items-baseline gap-1">
                    <span>{dashboardData.active_user_count}</span>
                    <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
                      / {dashboardData.max_active_users}
                    </span>
                  </span>
                ),
                hint: isAtUserLimit ? "At capacity" : "Active school users",
              }
            : {
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Incomplete
                  </span>
                ),
                value: loadingExams
                  ? "—"
                  : aggregates.pending.toLocaleString(),
                hint: "Missing photo or unpaid fee",
              },
        ]}
      />

      <div>
        <SectionLabel
          action={
            <Link
              href="/dashboard/my-school/register"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          }
        >
          Active examinations
        </SectionLabel>

        {loadingExams ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="space-y-4 rounded-lg border border-border bg-card p-5"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-20" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : activeExams.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-center shadow-none">
            <div className="mb-3 rounded-full bg-muted p-3">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No active examinations</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              There are no open registration windows for examinations your
              school is eligible for.
            </p>
            <Button variant="outline" size="sm" className="mt-4 shadow-none" asChild>
              <Link href="/dashboard/my-school/register">Go to register</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeExams.map((exam) => (
              <SchoolExamRegisterCard
                key={exam.id}
                exam={exam}
                kpis={
                  kpisByExam[exam.id] || {
                    total: 0,
                    approved: 0,
                    pending: 0,
                  }
                }
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Shortcuts</SectionLabel>
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
          {shortcuts.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/20 md:px-6 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
