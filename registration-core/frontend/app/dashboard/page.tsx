"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getActiveExams, getExamSchools, getExamProgrammes, type ExamSchool, type ProgrammeSummary } from "@/lib/api";
import type { User, RegistrationExam } from "@/types";
import { Calendar, Users as UsersIcon, Building2, Search, BookOpen, KeyRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { StatStrip } from "@/components/dashboard/StatStrip";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeExams, setActiveExams] = useState<RegistrationExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examSchools, setExamSchools] = useState<ExamSchool[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [examProgrammes, setExamProgrammes] = useState<ProgrammeSummary[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [schoolsDialogOpen, setSchoolsDialogOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then(async (userData) => {
        if (userData.role === "APIUSER") {
          router.push("/login");
          return;
        }

        if (!mounted) return;

        setUser(userData);
        setLoading(false);

        if (userData.role === "PublicUser") {
          setRedirecting(true);
          router.push("/dashboard/private");
          return;
        }

        if (userData.role === "SchoolAdmin" || userData.role === "SchoolStaff") {
          setRedirecting(true);
          router.push("/dashboard/my-school");
          return;
        }

        if (
          userData.role === "SystemAdmin" ||
          userData.role === "Director" ||
          userData.role === "DeputyDirector" ||
          userData.role === "PrincipalManager" ||
          userData.role === "SeniorManager" ||
          userData.role === "Manager" ||
          userData.role === "Staff"
        ) {
          loadActiveExams();
        }
      })
      .catch((error) => {
        console.error("Failed to get user:", error);
        if (!mounted) return;

        setLoading(false);
        router.push("/login");
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  const loadActiveExams = async () => {
    setLoadingExams(true);
    try {
      const exams = await getActiveExams();
      setActiveExams(exams);
      if (exams.length > 0 && !selectedExamId) {
        setSelectedExamId(exams[0].id);
      }
    } catch (error) {
      console.error("Failed to load active exams:", error);
    } finally {
      setLoadingExams(false);
    }
  };

  const loadExamSchools = async (examId: number) => {
    setLoadingSchools(true);
    try {
      const schools = await getExamSchools(examId);
      setExamSchools(schools);
    } catch (error) {
      console.error("Failed to load exam schools:", error);
      setExamSchools([]);
    } finally {
      setLoadingSchools(false);
    }
  };

  const loadExamProgrammes = async (examId: number) => {
    setLoadingProgrammes(true);
    try {
      const programmes = await getExamProgrammes(examId);
      setExamProgrammes(programmes);
    } catch (error) {
      console.error("Failed to load exam programmes:", error);
      setExamProgrammes([]);
    } finally {
      setLoadingProgrammes(false);
    }
  };

  useEffect(() => {
    if (selectedExamId) {
      loadExamSchools(selectedExamId);
      loadExamProgrammes(selectedExamId);
    }
  }, [selectedExamId]);

  const isSystemAdmin = user?.role === "SystemAdmin" ||
                        user?.role === "Director" ||
                        user?.role === "DeputyDirector" ||
                        user?.role === "PrincipalManager" ||
                        user?.role === "SeniorManager" ||
                        user?.role === "Manager" ||
                        user?.role === "Staff";

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  if (!user || !isSystemAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const getCompletionPercentage = (exam: RegistrationExam) => {
    if (!exam.candidate_count || exam.candidate_count === 0) return 0;
    const approved = exam.approved_candidates || 0;
    return Math.round((approved / exam.candidate_count) * 100 * 10) / 10;
  };

  const examTitleOf = (exam: RegistrationExam) =>
    `${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}`;

  const selectedExam = selectedExamId
    ? activeExams.find((e) => e.id === selectedExamId) ?? null
    : null;

  let daysRemaining: number | null = null;
  if (selectedExam?.registration_period?.registration_end_date) {
    const endDate = new Date(selectedExam.registration_period.registration_end_date);
    const diffDays = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    daysRemaining = diffDays > 0 ? diffDays : 0;
  }

  const completionPercentage = selectedExam ? getCompletionPercentage(selectedExam) : 0;
  const totalCandidates = selectedExam?.candidate_count || 0;
  const approvedCandidates = selectedExam?.approved_candidates || 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Home"
        subtitle="Track active examinations, school participation, and registration progress."
        actions={
          <>
            <Link href="/dashboard/exams">
              <Button>
                <Calendar className="mr-2 h-4 w-4" />
                View examinations
              </Button>
            </Link>
            <Link href="/dashboard/schools">
              <Button variant="outline">
                <Building2 className="mr-2 h-4 w-4" />
                Manage schools
              </Button>
            </Link>
          </>
        }
      />

      <StatStrip
        items={[
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" />
                Candidates
              </span>
            ),
            value: selectedExam ? (
              <span className="inline-flex items-baseline gap-2">
                <span>{totalCandidates.toLocaleString()}</span>
                <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
                  / {approvedCandidates.toLocaleString()} approved
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
                <KeyRound className="h-3.5 w-3.5" />
                Completion
              </span>
            ),
            value: selectedExam ? `${completionPercentage}%` : "—",
            hint: selectedExam ? (
              <Progress value={completionPercentage} className="mt-2 h-1.5" />
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
              daysRemaining === null ? (
                "—"
              ) : (
                <span className="inline-flex items-baseline gap-2">
                  <span className={daysRemaining <= 7 ? "text-warning" : undefined}>
                    {daysRemaining === 0 ? "0" : daysRemaining.toLocaleString()}
                  </span>
                  <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
                    {daysRemaining === 0 ? "ends today" : "days left"}
                  </span>
                </span>
              ),
            hint: selectedExam ? (
              <Link
                href={`/dashboard/exams/${selectedExam.id}`}
                className="text-primary hover:underline"
              >
                View examination details
              </Link>
            ) : (
              "—"
            ),
          },
        ]}
      />

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel
            action={
              <Link href="/dashboard/exams">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            }
          >
            Active examinations
          </SectionLabel>

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
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create a new examination to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeExams.map((exam) => {
                const pct = getCompletionPercentage(exam);
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
                        {(exam.candidate_count || 0).toLocaleString()} candidates · {pct}% complete
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/exams/${exam.id}`}
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
          <SectionLabel
            action={
              examSchools.length > 5 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchoolsDialogOpen(true)}
                >
                  View all
                </Button>
              ) : undefined
            }
          >
            Schools{examSchools.length > 0 ? ` (${examSchools.length})` : ""}
          </SectionLabel>

          {!selectedExamId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select an examination to view participating schools.
            </p>
          ) : loadingSchools ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-md border border-border p-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="ml-auto h-4 w-16" />
                </div>
              ))}
            </div>
          ) : examSchools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No schools found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No schools have registered candidates for this examination yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {examSchools.slice(0, 5).map((school) => (
                <div
                  key={school.id}
                  role="button"
                  tabIndex={0}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-2.5 transition-colors hover:bg-muted/50"
                  onClick={() => {
                    const url = selectedExamId
                      ? `/dashboard/schools/${school.id}?tab=registrations&exam_id=${selectedExamId}`
                      : `/dashboard/schools/${school.id}`;
                    router.push(url);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const url = selectedExamId
                        ? `/dashboard/schools/${school.id}?tab=registrations&exam_id=${selectedExamId}`
                        : `/dashboard/schools/${school.id}`;
                      router.push(url);
                    }
                  }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-medium text-primary">{school.name}</h4>
                      <Badge variant="outline" className="h-5 shrink-0 px-1.5 py-0 text-xs">
                        {school.code}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono text-sm font-semibold">
                      {school.candidate_count.toLocaleString()}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">candidates</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel>
            Programmes
            {selectedExamId && examProgrammes.length > 0
              ? ` (${examProgrammes.length})`
              : ""}
          </SectionLabel>

          {!selectedExamId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select an examination to view programmes summary.
            </p>
          ) : loadingProgrammes ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-md border border-border p-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : examProgrammes.length === 0 ? (
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
              {examProgrammes.map((programme) => {
                const pct =
                  programme.total_candidates > 0
                    ? Math.round(
                        (programme.completed_candidates / programme.total_candidates) * 100
                      )
                    : 0;

                return (
                  <div
                    key={programme.id}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-2.5 transition-colors hover:bg-muted/50"
                    onClick={() => {
                      if (selectedExamId) {
                        router.push(`/dashboard/exams/${selectedExamId}`);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && selectedExamId) {
                        e.preventDefault();
                        router.push(`/dashboard/exams/${selectedExamId}`);
                      }
                    }}
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
                        {programme.total_candidates > 0 ? (
                          <>
                            <span>•</span>
                            <span className="font-medium">{pct}%</span>
                          </>
                        ) : null}
                      </div>
                      {programme.total_candidates > 0 ? (
                        <Progress value={pct} className="mt-1.5 h-1" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={schoolsDialogOpen} onOpenChange={setSchoolsDialogOpen}>
        <DialogContent className="flex max-h-[80vh] min-w-[80vw] flex-col">
          <DialogHeader>
            <DialogTitle>Schools ({examSchools.length})</DialogTitle>
            <DialogDescription>
              Schools participating in this examination
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by school name or code..."
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-2">
            {examSchools
              .filter((school) => {
                if (!schoolSearch) return true;
                const searchLower = schoolSearch.toLowerCase();
                return (
                  school.name.toLowerCase().includes(searchLower) ||
                  school.code.toLowerCase().includes(searchLower)
                );
              })
              .map((school) => (
                <div
                  key={school.id}
                  className="flex cursor-pointer items-center gap-4 rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
                  onClick={() => {
                    const url = selectedExamId
                      ? `/dashboard/schools/${school.id}?tab=registrations&exam_id=${selectedExamId}`
                      : `/dashboard/schools/${school.id}`;
                    router.push(url);
                    setSchoolsDialogOpen(false);
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h4 className="truncate font-semibold text-primary">{school.name}</h4>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {school.code}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-lg font-semibold">
                      {school.candidate_count.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Candidates</div>
                  </div>
                </div>
              ))}
            {examSchools.filter((school) => {
              if (!schoolSearch) return false;
              const searchLower = schoolSearch.toLowerCase();
              return (
                school.name.toLowerCase().includes(searchLower) ||
                school.code.toLowerCase().includes(searchLower)
              );
            }).length === 0 && schoolSearch ? (
              <div className="py-8 text-center text-muted-foreground">
                No schools found matching &quot;{schoolSearch}&quot;
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
