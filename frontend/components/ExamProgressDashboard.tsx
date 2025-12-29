"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  FileText,
  Edit,
  CheckCircle2,
  FileCheck,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
  Users,
  BookOpen,
  FileSpreadsheet,
  Award,
} from "lucide-react";
import { getExamProgress, getAllExams, type Exam, type ExamProgressResponse } from "@/lib/api";
import { toast } from "sonner";

interface PhaseCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  progress: number;
  status: "complete" | "in_progress" | "pending";
  metrics: Array<{ label: string; value: string | number }>;
  onClick?: () => void;
}

function PhaseCard({ title, description, icon, progress, status, metrics, onClick }: PhaseCardProps) {
  const statusConfig = {
    complete: {
      iconBg: "bg-gradient-to-br from-green-500 to-emerald-600",
      badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
      progressColor: "bg-green-500",
      cardBorder: "border-green-200 dark:border-green-800",
    },
    in_progress: {
      iconBg: "bg-gradient-to-br from-blue-500 to-cyan-600",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
      progressColor: "bg-blue-500",
      cardBorder: "border-blue-200 dark:border-blue-800",
    },
    pending: {
      iconBg: "bg-gradient-to-br from-gray-400 to-gray-500",
      badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700",
      progressColor: "bg-gray-400",
      cardBorder: "border-gray-200 dark:border-gray-700",
    },
  };

  const statusLabels = {
    complete: "Complete",
    in_progress: "In Progress",
    pending: "Pending",
  };

  const config = statusConfig[status];

  const hoverGradient = {
    complete: "to-green-50/50 dark:to-green-900/10",
    in_progress: "to-blue-50/50 dark:to-blue-900/10",
    pending: "to-gray-50/50 dark:to-gray-900/10",
  };

  return (
    <Card
      className={`group cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
        onClick ? `hover:border-2 ${config.cardBorder}` : ""
      } relative overflow-hidden`}
      onClick={onClick}
    >
      {/* Gradient overlay on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br from-transparent via-transparent ${hoverGradient[status]} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.iconBg} text-white shadow-lg transform group-hover:scale-110 transition-transform duration-300`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{title}</CardTitle>
              <CardDescription className="text-sm mt-1">{description}</CardDescription>
            </div>
          </div>
          <Badge className={`${config.badge} font-semibold border`}>
            {statusLabels[status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 relative z-10">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className={`font-bold text-lg ${status === "complete" ? "text-green-600 dark:text-green-400" : status === "in_progress" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}`}>
              {progress.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${config.progressColor} rounded-full transition-all duration-500 ease-out shadow-sm`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
            {progress > 0 && progress < 100 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className="space-y-1 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors duration-200"
            >
              <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
              <p className="text-sm font-bold text-foreground">{metric.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ExamProgressDashboard() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [progress, setProgress] = useState<ExamProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        setLoading(true);
        const examsList = await getAllExams();
        const sortedExams = examsList.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA; // Most recent first
        });
        setExams(sortedExams);
        if (sortedExams.length > 0 && !selectedExamId) {
          setSelectedExamId(sortedExams[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load examinations");
        toast.error("Failed to load examinations");
      } finally {
        setLoading(false);
      }
    };

    loadExams();
  }, []);

  // Load progress when exam is selected
  useEffect(() => {
    const loadProgress = async () => {
      if (!selectedExamId) return;

      try {
        setLoadingProgress(true);
        setError(null);
        const progressData = await getExamProgress(selectedExamId);
        setProgress(progressData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load progress");
        toast.error("Failed to load examination progress");
      } finally {
        setLoadingProgress(false);
      }
    };

    loadProgress();
  }, [selectedExamId]);

  const handleRefresh = async () => {
    if (!selectedExamId) return;
    try {
      setLoadingProgress(true);
      const progressData = await getExamProgress(selectedExamId);
      setProgress(progressData);
      toast.success("Progress refreshed");
    } catch (err) {
      toast.error("Failed to refresh progress");
    } finally {
      setLoadingProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Examinations Found</h3>
          <p className="text-muted-foreground mb-4">
            Create an examination to start tracking progress.
          </p>
          <Button onClick={() => router.push("/examinations")}>Go to Examinations</Button>
        </CardContent>
      </Card>
    );
  }

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  return (
    <div className="space-y-6 pb-6">
      {/* Header with Exam Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
              <Award className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Examination Progress Dashboard
            </h1>
          </div>
          <p className="text-muted-foreground mt-1 ml-12">
            Track progress from preparation through results release
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedExamId?.toString() || ""}
            onValueChange={(value) => setSelectedExamId(parseInt(value, 10))}
            disabled={loadingProgress}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select examination" />
            </SelectTrigger>
            <SelectContent>
              {exams.map((exam) => (
                <SelectItem key={exam.id} value={exam.id.toString()}>
                  {exam.exam_type} - {exam.series} {exam.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={loadingProgress || !selectedExamId}
            className="hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loadingProgress ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingProgress ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : progress ? (
        <>
          {/* Summary Statistics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <Users className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {progress.preparations.registration.total_candidates}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Registered candidates</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-purple-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">Documents Uploaded</CardTitle>
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                  <FileText className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {progress.results_processing.document_processing.total_documents}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Total documents</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-amber-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">Scores Entered</CardTitle>
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  <Edit className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {progress.results_processing.scoring_data_entry.total_actual_score_entries} / {progress.results_processing.scoring_data_entry.total_expected_score_entries}
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {progress.results_processing.scoring_data_entry.completion_percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(progress.results_processing.scoring_data_entry.completion_percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-l-4 border-l-emerald-500">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                  <Award className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className={`text-3xl font-bold ${
                  progress.overall_completion_percentage === 100
                    ? "text-emerald-600 dark:text-emerald-400"
                    : progress.overall_completion_percentage > 50
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}>
                  {progress.overall_completion_percentage.toFixed(1)}%
                </div>
                <div className="mt-2">
                  <Badge
                    variant={
                      progress.overall_status === "complete"
                        ? "default"
                        : progress.overall_status === "in_progress"
                        ? "secondary"
                        : "outline"
                    }
                    className="text-xs"
                  >
                    {progress.overall_status === "complete"
                      ? "Complete"
                      : progress.overall_status === "in_progress"
                      ? "In Progress"
                      : "Pending"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Phase Cards - 3 Main Categories */}
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
            <PhaseCard
              title="Preparations"
              description="Registration, serialization, and ICM/PDF generation"
              icon={<ClipboardList className="h-5 w-5" />}
              progress={progress.preparations.overall_completion_percentage}
              status={progress.preparations.status}
              metrics={[
                { label: "Candidates Registered", value: progress.preparations.registration.total_candidates },
                { label: "Serialized", value: `${progress.preparations.serialization.candidates_serialized}/${progress.preparations.serialization.total_candidates}` },
                { label: "Schools with Sheets", value: `${progress.preparations.icm_pdf_generation.schools_with_sheets}/${progress.preparations.icm_pdf_generation.total_schools}` },
              ]}
              onClick={() => router.push(`/examinations/${selectedExamId}`)}
            />
            <PhaseCard
              title="Results Processing"
              description="Score interpretation, documents, scoring, validation, and processing"
              icon={<CheckCircle2 className="h-5 w-5" />}
              progress={progress.results_processing.overall_completion_percentage}
              status={progress.results_processing.status}
              metrics={[
                { label: "Documents Processed", value: `${progress.results_processing.document_processing.documents_scores_extracted_success}/${progress.results_processing.document_processing.total_documents}` },
                { label: "Scores Entered", value: `${progress.results_processing.scoring_data_entry.total_actual_score_entries}/${progress.results_processing.scoring_data_entry.total_expected_score_entries}` },
                { label: "Results Processed", value: `${progress.results_processing.results_processing.registrations_processed}/${progress.results_processing.results_processing.total_subject_registrations}` },
              ]}
              onClick={() => router.push("/icm-studio/documents")}
            />
            <PhaseCard
              title="Results Release"
              description="Grade ranges setup and finalization"
              icon={<FileCheck className="h-5 w-5" />}
              progress={progress.results_release.overall_completion_percentage}
              status={progress.results_release.status}
              metrics={[
                { label: "Subjects with Grade Ranges", value: `${progress.results_release.grade_ranges.subjects_with_grade_ranges}/${progress.results_release.grade_ranges.total_subjects}` },
              ]}
              onClick={() => router.push(`/examinations/${selectedExamId}`)}
            />
          </div>

          {/* Overall Progress Timeline */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-background to-muted/20">
            <CardHeader className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <ArrowRight className="h-4 w-4" />
                </div>
                <CardTitle className="text-xl">Overall Progress Timeline</CardTitle>
              </div>
              <CardDescription className="text-base">
                {selectedExam && `${selectedExam.exam_type} - ${selectedExam.series} ${selectedExam.year}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">Overall Completion</span>
                    <span className={`text-2xl font-bold ${
                      progress.overall_completion_percentage === 100
                        ? "text-emerald-600 dark:text-emerald-400"
                        : progress.overall_completion_percentage > 50
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}>
                      {progress.overall_completion_percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        progress.overall_completion_percentage === 100
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
                          : progress.overall_completion_percentage > 50
                          ? "bg-gradient-to-r from-blue-500 to-cyan-600"
                          : "bg-gradient-to-r from-amber-500 to-orange-500"
                      } shadow-lg`}
                      style={{ width: `${Math.min(progress.overall_completion_percentage, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow">
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">Preparations</div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {progress.preparations.overall_completion_percentage.toFixed(0)}%
                    </div>
                    <div className="mt-2 h-1.5 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(progress.preparations.overall_completion_percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 hover:shadow-md transition-shadow">
                    <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2 uppercase tracking-wide">Results Processing</div>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                      {progress.results_processing.overall_completion_percentage.toFixed(0)}%
                    </div>
                    <div className="mt-2 h-1.5 bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(progress.results_processing.overall_completion_percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 hover:shadow-md transition-shadow">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wide">Results Release</div>
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                      {progress.results_release.overall_completion_percentage.toFixed(0)}%
                    </div>
                    <div className="mt-2 h-1.5 bg-emerald-200 dark:bg-emerald-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(progress.results_release.overall_completion_percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Progress Data</h3>
            <p className="text-muted-foreground">Select an examination to view progress.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
