"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getActiveExams, getExamSchools, type ExamSchool } from "@/lib/api";
import type { User, RegistrationExam } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users as UsersIcon, CheckCircle2, Building2, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeExams, setActiveExams] = useState<RegistrationExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examSchools, setExamSchools] = useState<ExamSchool[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolsDialogOpen, setSchoolsDialogOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // CRITICAL: Check API users FIRST before any rendering
    getCurrentUser()
      .then((userData) => {
        // CRITICAL: Redirect API users FIRST, before any state updates
        if (userData.role === "APIUSER") {
          window.location.replace("/api/dashboard");
          return; // Exit immediately, don't render anything
        }

        if (!mounted) return;

        setUser(userData);
        setLoading(false);

        // Redirect private users to their dashboard
        if (userData.role === "PublicUser") {
          setRedirecting(true);
          router.push("/dashboard/private");
          return;
        }

        // Redirect school users (SchoolAdmin, User) to their school dashboard
        if (userData.role === "SchoolAdmin" || userData.role === "SchoolStaff") {
          setRedirecting(true);
          router.push("/dashboard/my-school");
          return;
        }

        // Load active exams for system admin
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
        // If we can't get user, redirect to login
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
      // Auto-select first exam if available
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

  useEffect(() => {
    if (selectedExamId) {
      loadExamSchools(selectedExamId);
    }
  }, [selectedExamId]);

  // Only show system admin dashboard for SystemAdmin, Director, DeputyDirector, PrincipalManager, and other admin roles
  const isSystemAdmin = user?.role === "SystemAdmin" ||
                        user?.role === "Director" ||
                        user?.role === "DeputyDirector" ||
                        user?.role === "PrincipalManager" ||
                        user?.role === "SeniorManager" ||
                        user?.role === "Manager" ||
                        user?.role === "Staff";

  // Show loading while checking user
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // If redirecting, show loading
  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Redirecting...</div>
      </div>
    );
  }

  // If no user or not a system admin, the layout should have redirected, but show loading as fallback
  if (!user || !isSystemAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const getCompletionPercentage = (exam: RegistrationExam) => {
    if (!exam.candidate_count || exam.candidate_count === 0) return 0;
    const approved = exam.approved_candidates || 0;
    return Math.round((approved / exam.candidate_count) * 100 * 10) / 10;
  };

  return (
    <div className="space-y-6 max-w-8xl mx-auto">
      {/* Header Section */}
      <div className="space-y-2">
        <p className="text-muted-foreground">Welcome back, {user?.full_name || "Admin"}</p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Active Examinations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Active Examinations</h2>
            <Link href="/dashboard/exams">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>

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
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Calendar className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Active Examinations</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-4">
                    There are no active examinations at this time. Create a new examination to get started.
                  </p>
                  <Link href="/dashboard/exams">
                    <Button>
                      <Calendar className="mr-2 h-4 w-4" />
                      View All Examinations
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeExams.map((exam) => {
                const completionPercentage = getCompletionPercentage(exam);
                const examTitle = `${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}`;
                const isSelected = selectedExamId === exam.id;

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
                          <UsersIcon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Candidates</p>
                            <p className="text-xl font-bold">{exam.candidate_count || 0}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="text-xs text-muted-foreground">Approved</p>
                            <p className="text-xl font-bold">{exam.approved_candidates || 0}</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <div className="flex gap-2">
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExamId(exam.id);
                            }}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </Button>
                          <Link href={`/dashboard/exams/${exam.id}`} onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" className="flex-1">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column - Schools List */}
        <Card className="h-full flex flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle>
                Schools {examSchools.length > 0 && `(${examSchools.length})`}
              </CardTitle>
              {examSchools.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchoolsDialogOpen(true)}
                  className="text-sm"
                >
                  View all
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto">
            {!selectedExamId ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Building2 className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Select an Examination</h3>
                <p className="text-sm text-muted-foreground">
                  Select an examination from the left to view participating schools
                </p>
              </div>
            ) : loadingSchools ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : examSchools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Building2 className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Schools Found</h3>
                <p className="text-sm text-muted-foreground">
                  No schools have registered candidates for this examination yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {examSchools.slice(0, 5).map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>

                    {/* School Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-primary truncate">{school.name}</h4>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {school.code}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-green-500 text-white text-xs">
                          Active
                        </Badge>
                      </div>
                    </div>

                    {/* Candidate Count */}
                    <div className="text-right shrink-0">
                      <div className="font-bold text-lg">{school.candidate_count.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Candidates</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schools Dialog */}
        <Dialog open={schoolsDialogOpen} onOpenChange={setSchoolsDialogOpen}>
          <DialogContent className="min-w-[80vw] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Schools ({examSchools.length})
              </DialogTitle>
              <DialogDescription>
                Schools participating in this examination
              </DialogDescription>
            </DialogHeader>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by school name or code..."
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Schools List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {examSchools
                .filter((school) => {
                  if (!schoolSearch) return true;
                  const searchLower = schoolSearch.toLowerCase();
                  return (
                    school.name.toLowerCase().includes(searchLower) ||
                    school.code.toLowerCase().includes(searchLower)
                  );
                })
                .map((school, index) => (
                  <Card key={school.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>

                        {/* School Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-primary truncate">{school.name}</h4>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {school.code}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="bg-green-500 text-white text-xs">
                              Active
                            </Badge>
                          </div>
                        </div>

                        {/* Candidate Count */}
                        <div className="text-right shrink-0">
                          <div className="font-bold text-lg">{school.candidate_count.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Candidates</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              {examSchools.filter((school) => {
                if (!schoolSearch) return false;
                const searchLower = schoolSearch.toLowerCase();
                return (
                  school.name.toLowerCase().includes(searchLower) ||
                  school.code.toLowerCase().includes(searchLower)
                );
              }).length === 0 && schoolSearch && (
                <div className="text-center py-8 text-muted-foreground">
                  No schools found matching "{schoolSearch}"
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
