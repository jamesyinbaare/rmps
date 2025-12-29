"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ExamSubjectCard } from "@/components/ExamSubjectCard";
import { ExamSubjectListItem } from "@/components/ExamSubjectListItem";
import { ExamSubjectBulkUpload } from "@/components/ExamSubjectBulkUpload";
import { ExamInfoDrawer } from "@/components/ExamInfoDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getExam, listExamSubjects, serializeExam, downloadExamSubjectTemplate, type ExamSubject, type SerializationResponse, processExamSubjects, processExamResults, updateExam } from "@/lib/api";
import type { Exam } from "@/types/document";
import { ArrowLeft, Search, X, ClipboardList, Edit, Calendar, Users, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Download, Upload, LayoutGrid, List, PanelLeftOpen, CheckCircle, XCircle, AlertTriangle, BarChart3, ArrowUpDown, FileSpreadsheet } from "lucide-react";
import { SubjectInsightsPlayground } from "@/components/SubjectInsightsPlayground";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export default function ExaminationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = params.id ? parseInt(params.id as string) : null;

  // Get initial tab from URL, default to "serialization"
  const getInitialTab = () => {
    const tabParam = searchParams.get("tab");
    const validTabs = ["serialization", "score-interpretation", "result-processing", "insights"];
    if (tabParam && validTabs.includes(tabParam)) {
      return tabParam;
    }
    return "serialization";
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab());

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  // Sync tab state with URL changes (browser back/forward)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const validTabs = ["serialization", "score-interpretation", "result-processing", "insights"];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab((currentTab) => {
        // Only update if different to avoid unnecessary re-renders
        return tabParam !== currentTab ? tabParam : currentTab;
      });
    }
  }, [searchParams]);

  const [exam, setExam] = useState<Exam | null>(null);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [completionFilter, setCompletionFilter] = useState<"ALL" | "COMPLETE" | "INCOMPLETE">("ALL");
  const [sortBy, setSortBy] = useState<"name" | "code" | "type" | "completion">("name");
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [serializing, setSerializing] = useState(false);
  const [serializationResult, setSerializationResult] = useState<SerializationResponse | null>(null);
  const [serializationError, setSerializationError] = useState<string | null>(null);
  const [selectedSubjectCodes, setSelectedSubjectCodes] = useState<Set<string>>(new Set());
  const [showSerializedSubjects, setShowSerializedSubjects] = useState(false);
  const [serializationSearchQuery, setSerializationSearchQuery] = useState<string>("");
  const [serializationTypeFilter, setSerializationTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [savingSelection, setSavingSelection] = useState(false);
  const [showSerializationConfirm, setShowSerializationConfirm] = useState(false);
  const [showDefaultSubjects, setShowDefaultSubjects] = useState(true);
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [selectedExamSubjectIds, setSelectedExamSubjectIds] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<{ successful: number; failed: number; errors: any[] } | null>(null);
  const [processingSearchQuery, setProcessingSearchQuery] = useState<string>("");
  const [processingTypeFilter, setProcessingTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [showProcessingConfirm, setShowProcessingConfirm] = useState(false);
  const [showProcessingErrors, setShowProcessingErrors] = useState(false);

  // Load examination data
  useEffect(() => {
    const loadExamination = async () => {
      if (!examId) {
        setError("Invalid examination ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const examData = await getExam(examId);
        setExam(examData);

        const subjectsData = await listExamSubjects(examId);
        setSubjects(subjectsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load examination");
        console.error("Error loading examination:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExamination();
  }, [examId]);

  // Default subject codes to serialize (CORE subjects + specific codes)
  const DEFAULT_SERIALIZE_CODES = ["301", "302", "421", "422", "461", "462", "471", "472", "601", "602", "621", "622", "701", "702", "703", "704", "705"];

  // Initialize selectedSubjectCodes from exam.subjects_to_serialize or defaults
  useEffect(() => {
    if (exam && subjects.length > 0) {
      if (exam.subjects_to_serialize && exam.subjects_to_serialize.length > 0) {
        // Use saved selection from database (backend computed defaults or user-saved selection)
        setSelectedSubjectCodes(new Set(exam.subjects_to_serialize));
      } else {
        // Fallback to frontend defaults if backend doesn't provide any
        // This should rarely happen as backend should compute defaults
        const coreCodes = subjects
          .filter((s) => s.subject_type === "CORE")
          .map((s) => s.subject_code);
        const allCodes = new Set([...coreCodes, ...DEFAULT_SERIALIZE_CODES]);
        setSelectedSubjectCodes(allCodes);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, subjects]);

  // Helper to check if subject is completely configured
  const isSubjectComplete = (subject: ExamSubject): boolean => {
    // Check if required percentages are provided (obj and essay are required, pract is optional)
    const hasPercentages =
      subject.obj_pct !== null &&
      subject.essay_pct !== null;

    // Check if required max scores are provided (obj and essay are required, pract is optional)
    const hasMaxScores =
      subject.obj_max_score !== null &&
      subject.essay_max_score !== null;

    // Check if grade ranges are configured
    const hasGradeRanges = !!(subject.grade_ranges_json && subject.grade_ranges_json.length > 0);

    // Check if percentages sum to 100 (if provided)
    if (hasPercentages && subject.obj_pct !== null && subject.essay_pct !== null) {
      const total = (subject.obj_pct || 0) + (subject.essay_pct || 0) + (subject.pract_pct || 0);
      if (Math.abs(total - 100) > 0.01) return false;
    }

    return hasPercentages && hasMaxScores && hasGradeRanges;
  };

  // Filter subjects based on search, type filter, and completion status
  const filteredSubjects = useMemo(() => {
    let filtered = subjects.filter((subject) => {
      // Search filter - search by original_code, subject_code, and name
      const matchesSearch =
        searchQuery === "" ||
        (subject.original_code || subject.subject_code).toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.subject_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType =
        subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;

      // Completion filter
      const matchesCompletion =
        completionFilter === "ALL" ||
        (completionFilter === "COMPLETE" && isSubjectComplete(subject)) ||
        (completionFilter === "INCOMPLETE" && !isSubjectComplete(subject));

      return matchesSearch && matchesType && matchesCompletion;
    });

    // Sort subjects
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.subject_name.localeCompare(b.subject_name);
        case "code":
          return (a.original_code || a.subject_code).localeCompare(b.original_code || b.subject_code);
        case "type":
          if (a.subject_type !== b.subject_type) {
            return a.subject_type === "CORE" ? -1 : 1;
          }
          return a.subject_name.localeCompare(b.subject_name);
        case "completion":
          const aComplete = isSubjectComplete(a);
          const bComplete = isSubjectComplete(b);
          if (aComplete !== bComplete) {
            return aComplete ? 1 : -1; // Incomplete first
          }
          return a.subject_name.localeCompare(b.subject_name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [subjects, searchQuery, subjectTypeFilter, completionFilter, sortBy]);

  // Group filtered subjects by type
  const groupedSubjects = useMemo(() => {
    const core = filteredSubjects.filter((s) => s.subject_type === "CORE");
    const elective = filteredSubjects.filter((s) => s.subject_type === "ELECTIVE");
    return { core, elective };
  }, [filteredSubjects]);

  // Calculate statistics
  const subjectStats = useMemo(() => {
    const total = subjects.length;
    const core = subjects.filter((s) => s.subject_type === "CORE").length;
    const elective = subjects.filter((s) => s.subject_type === "ELECTIVE").length;
    const complete = subjects.filter((s) => isSubjectComplete(s)).length;
    const incomplete = total - complete;
    const hasGradeRanges = subjects.filter((s) => s.grade_ranges_json && s.grade_ranges_json.length > 0).length;
    const missingGradeRanges = total - hasGradeRanges;

    return {
      total,
      core,
      elective,
      complete,
      incomplete,
      hasGradeRanges,
      missingGradeRanges,
      completionPercentage: total > 0 ? Math.round((complete / total) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  // Filter subjects for result processing tab
  const filteredProcessingSubjects = useMemo(() => {
    return subjects.filter((subject) => {
      // Search filter - search by original_code, subject_code, and name
      const matchesSearch =
        processingSearchQuery === "" ||
        (subject.original_code || subject.subject_code).toLowerCase().includes(processingSearchQuery.toLowerCase()) ||
        subject.subject_code.toLowerCase().includes(processingSearchQuery.toLowerCase()) ||
        subject.subject_name.toLowerCase().includes(processingSearchQuery.toLowerCase());

      // Type filter
      const matchesType =
        processingTypeFilter === "ALL" || subject.subject_type === processingTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [subjects, processingSearchQuery, processingTypeFilter]);

  // Group filtered processing subjects by type
  const groupedProcessingSubjects = useMemo(() => {
    const core = filteredProcessingSubjects.filter((s) => s.subject_type === "CORE");
    const elective = filteredProcessingSubjects.filter((s) => s.subject_type === "ELECTIVE");
    return { core, elective };
  }, [filteredProcessingSubjects]);

  // Processing selection statistics
  const processingSelectionStats = useMemo(() => {
    const selected = Array.from(selectedExamSubjectIds);
    const selectedSubjects = subjects.filter((s) => selected.includes(s.id));
    const coreSelected = selectedSubjects.filter((s) => s.subject_type === "CORE").length;
    const electiveSelected = selectedSubjects.filter((s) => s.subject_type === "ELECTIVE").length;
    const completeSelected = selectedSubjects.filter((s) => isSubjectComplete(s)).length;
    const incompleteSelected = selectedSubjects.length - completeSelected;

    return {
      total: selectedExamSubjectIds.size,
      core: coreSelected,
      elective: electiveSelected,
      complete: completeSelected,
      incomplete: incompleteSelected,
      totalSubjects: subjects.length,
      percentage: subjects.length > 0 ? Math.round((selectedExamSubjectIds.size / subjects.length) * 100) : 0,
    };
  }, [selectedExamSubjectIds, subjects]);

  // Filter subjects for serialization tab
  const filteredSerializationSubjects = useMemo(() => {
    return subjects.filter((subject) => {
      // Search filter
      const matchesSearch =
        serializationSearchQuery === "" ||
        subject.subject_code.toLowerCase().includes(serializationSearchQuery.toLowerCase()) ||
        subject.subject_name.toLowerCase().includes(serializationSearchQuery.toLowerCase());

      // Type filter
      const matchesType =
        serializationTypeFilter === "ALL" || subject.subject_type === serializationTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [subjects, serializationSearchQuery, serializationTypeFilter]);

  // Group filtered subjects by type
  const groupedSerializationSubjects = useMemo(() => {
    const core = filteredSerializationSubjects.filter((s) => s.subject_type === "CORE");
    const elective = filteredSerializationSubjects.filter((s) => s.subject_type === "ELECTIVE");
    return { core, elective };
  }, [filteredSerializationSubjects]);

  // Selection statistics
  const selectionStats = useMemo(() => {
    const selected = Array.from(selectedSubjectCodes);
    const selectedSubjects = subjects.filter((s) => selected.includes(s.subject_code));
    const coreSelected = selectedSubjects.filter((s) => s.subject_type === "CORE").length;
    const electiveSelected = selectedSubjects.filter((s) => s.subject_type === "ELECTIVE").length;
    return {
      total: selectedSubjectCodes.size,
      core: coreSelected,
      elective: electiveSelected,
      totalSubjects: subjects.length,
      percentage: subjects.length > 0 ? Math.round((selectedSubjectCodes.size / subjects.length) * 100) : 0,
    };
  }, [selectedSubjectCodes, subjects]);

  // Check if subject is in default list
  const isDefaultSubject = (subjectCode: string) => {
    return DEFAULT_SERIALIZE_CODES.includes(subjectCode);
  };

  // Helper to get original_code from subject_code
  const getOriginalCode = (subjectCode: string): string => {
    const subject = subjects.find((s) => s.subject_code === subjectCode);
    return subject?.original_code || subjectCode;
  };

  const handleSubjectUpdate = (updatedSubject: ExamSubject) => {
    setSubjects((prev) =>
      prev.map((subject) =>
        subject.id === updatedSubject.id ? updatedSubject : subject
      )
    );
  };

  const handleUploadSuccess = async () => {
    if (!examId) return;
    try {
      const updatedSubjects = await listExamSubjects(examId);
      setSubjects(updatedSubjects);
      setUploadDialogOpen(false);
    } catch (error) {
      console.error("Error refreshing subjects:", error);
    }
  };

  const handleEditSuccess = async () => {
    if (!examId) return;
    try {
      const updatedExam = await getExam(examId);
      setExam(updatedExam);
    } catch (error) {
      console.error("Error refreshing examination:", error);
    }
  };

  const handleDownloadTemplate = async (subjectType?: "CORE" | "ELECTIVE") => {
    if (!examId) return;
    try {
      const typeKey = subjectType || "all";
      setDownloadingTemplate(typeKey);
      const blob = await downloadExamSubjectTemplate(examId, subjectType);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Generate better filename with exam details
      const examName = exam?.exam_type || "exam";
      const year = exam?.year || examId;
      const series = exam?.series || "";
      const typeSuffix = subjectType ? `_${subjectType.toLowerCase()}` : "";
      const filename = `${examName}_${year}_${series}_subjects${typeSuffix}_template.xlsx`
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toLowerCase();
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      const subjectCount = subjectType
        ? subjects.filter(s => s.subject_type === subjectType).length
        : subjects.length;
      toast.success(`Template downloaded successfully (${subjectCount} subject${subjectCount !== 1 ? "s" : ""})`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download template";
      toast.error(errorMessage);
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const handleSerialization = () => {
    setShowSerializationConfirm(true);
  };

  const confirmSerialization = async () => {
    if (!examId) return;
    setShowSerializationConfirm(false);

    setSerializing(true);
    setSerializationError(null);
    setSerializationResult(null);

    try {
      const subjectCodesArray = Array.from(selectedSubjectCodes);
      const result = await serializeExam(examId, subjectCodesArray.length > 0 ? subjectCodesArray : undefined);
      setSerializationResult(result);
    } catch (err) {
      setSerializationError(err instanceof Error ? err.message : "Failed to serialize candidates");
      console.error("Error serializing candidates:", err);
    } finally {
      setSerializing(false);
    }
  };

  const toggleSubjectSelection = async (subjectCode: string) => {
    setSavingSelection(true);
    setSelectedSubjectCodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(subjectCode)) {
        newSet.delete(subjectCode);
      } else {
        newSet.add(subjectCode);
      }
      // Save selection to exam
      if (examId) {
        const codesArray = Array.from(newSet);
        updateExam(examId, { subjects_to_serialize: codesArray })
          .then(() => {
            setSavingSelection(false);
          })
          .catch((err) => {
            console.error("Failed to save selection:", err);
            setSavingSelection(false);
            toast.error("Failed to save selection");
          });
      } else {
        setSavingSelection(false);
      }
      return newSet;
    });
  };

  const selectAllSubjects = async () => {
    setSavingSelection(true);
    const allCodes = new Set(subjects.map((s) => s.subject_code));
    setSelectedSubjectCodes(allCodes);
    // Save selection to exam
    if (examId) {
      const codesArray = Array.from(allCodes);
      updateExam(examId, { subjects_to_serialize: codesArray })
        .then(() => {
          setSavingSelection(false);
          toast.success("Selection saved");
        })
        .catch((err) => {
          console.error("Failed to save selection:", err);
          setSavingSelection(false);
          toast.error("Failed to save selection");
        });
    } else {
      setSavingSelection(false);
    }
  };

  const selectCoreSubjects = async () => {
    setSavingSelection(true);
    const coreCodes = new Set(subjects.filter((s) => s.subject_type === "CORE").map((s) => s.subject_code));
    setSelectedSubjectCodes(coreCodes);
    // Save selection to exam
    if (examId) {
      const codesArray = Array.from(coreCodes);
      updateExam(examId, { subjects_to_serialize: codesArray })
        .then(() => {
          setSavingSelection(false);
          toast.success("Selection saved");
        })
        .catch((err) => {
          console.error("Failed to save selection:", err);
          setSavingSelection(false);
          toast.error("Failed to save selection");
        });
    } else {
      setSavingSelection(false);
    }
  };

  const selectDefaultSubjects = async () => {
    setSavingSelection(true);
    const coreCodes = subjects.filter((s) => s.subject_type === "CORE").map((s) => s.subject_code);
    const allCodes = new Set([...coreCodes, ...DEFAULT_SERIALIZE_CODES]);
    setSelectedSubjectCodes(allCodes);
    // Save selection to exam
    if (examId) {
      const codesArray = Array.from(allCodes);
      updateExam(examId, { subjects_to_serialize: codesArray })
        .then(() => {
          setSavingSelection(false);
          toast.success("Default selection restored");
        })
        .catch((err) => {
          console.error("Failed to save selection:", err);
          setSavingSelection(false);
          toast.error("Failed to save selection");
        });
    } else {
      setSavingSelection(false);
    }
  };

  const clearSubjectSelection = async () => {
    setSavingSelection(true);
    setSelectedSubjectCodes(new Set());
    // Save selection to exam
    if (examId) {
      updateExam(examId, { subjects_to_serialize: [] })
        .then(() => {
          setSavingSelection(false);
          toast.success("Selection cleared");
        })
        .catch((err) => {
          console.error("Failed to save selection:", err);
          setSavingSelection(false);
          toast.error("Failed to save selection");
        });
    } else {
      setSavingSelection(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Examination Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Loading..." />
          <div className="flex-1 overflow-y-auto py-6 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="max-w-full lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[66.666667%] mx-auto">
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-64 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !exam) {
    return (
      <DashboardLayout title="Examination Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Error" />
          <div className="flex-1 overflow-y-auto py-6 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="max-w-full lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[66.666667%] mx-auto">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error || "Examination not found"}
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push("/examinations")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Examinations
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Examination Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={`${exam.exam_type} - ${exam.year} ${exam.series}`}
        />
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
          {/* Header with sidebar expander button and Tab Navigation */}
          <div className="flex items-center justify-between border-b border-border bg-background px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-4">
            <TabsList className="h-auto justify-start rounded-none border border-border bg-transparent p-0">
              <TabsTrigger
                value="serialization"
                className="rounded-none border-r border-border border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Serialization
              </TabsTrigger>
              <TabsTrigger
                value="score-interpretation"
                className="rounded-none border-r border-border border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Score interpretation
              </TabsTrigger>
              <TabsTrigger
                value="result-processing"
                className="rounded-none border-r border-border border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Result Processing
              </TabsTrigger>
              <TabsTrigger
                value="insights"
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Insights
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setInfoDrawerOpen(true)}
                className="h-9 w-9"
                title="Examination Information"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-6 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-4">
            <div className="max-w-full lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[5/6] mx-auto">
            <TabsContent value="serialization" className="mt-0">
              {/* Serialization Card */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Candidate Serialization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select subjects to serialize. Selected subjects will have candidates assigned series numbers (1 to {exam.number_of_series}) in round-robin fashion.
                    Unselected subjects will have all candidates assigned a default series of 1.
                  </p>

                  {/* Search and Filter */}
                  {subjects.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search subjects by code or name..."
                          value={serializationSearchQuery}
                          onChange={(e) => setSerializationSearchQuery(e.target.value)}
                          className="pl-9 pr-9"
                        />
                        {serializationSearchQuery && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                            onClick={() => setSerializationSearchQuery("")}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Select
                        value={serializationTypeFilter}
                        onValueChange={(value: "ALL" | "CORE" | "ELECTIVE") => setSerializationTypeFilter(value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Types</SelectItem>
                          <SelectItem value="CORE">Core Only</SelectItem>
                          <SelectItem value="ELECTIVE">Elective Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Selection Statistics */}
                  {subjects.length > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Selection Summary</p>
                        {savingSelection && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Saving...
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total:</span>{" "}
                          <span className="font-semibold">{selectionStats.total}</span> / {selectionStats.totalSubjects}
                        </div>
                        <div>
                          <span className="text-muted-foreground">CORE:</span>{" "}
                          <span className="font-semibold">{selectionStats.core}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ELECTIVE:</span>{" "}
                          <span className="font-semibold">{selectionStats.elective}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Progress:</span>{" "}
                          <span className="font-semibold">{selectionStats.percentage}%</span>
                        </div>
                      </div>
                      {selectionStats.total > 0 && (
                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${selectionStats.percentage}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Selection Buttons */}
                  {subjects.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectDefaultSubjects}
                        disabled={serializing || savingSelection}
                        title="Select CORE subjects plus default elective subjects"
                      >
                        Select Defaults
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectCoreSubjects}
                        disabled={serializing || savingSelection}
                      >
                        Select All CORE
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllSubjects}
                        disabled={serializing || savingSelection}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSubjectSelection}
                        disabled={serializing || savingSelection}
                      >
                        Clear
                      </Button>
                      {!showDefaultSubjects && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDefaultSubjects(true)}
                        >
                          Show Default Indicators
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Subject Selection - Grouped by Type */}
                  {filteredSerializationSubjects.length > 0 && (
                    <div className="space-y-4">
                      {/* CORE Subjects */}
                      {groupedSerializationSubjects.core.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">
                              CORE Subjects ({groupedSerializationSubjects.core.length})
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2 bg-muted/20">
                            {groupedSerializationSubjects.core.map((subject) => (
                              <div key={subject.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`serialize-subject-${subject.id}`}
                                  checked={selectedSubjectCodes.has(subject.subject_code)}
                                  onCheckedChange={() => toggleSubjectSelection(subject.subject_code)}
                                  disabled={serializing || savingSelection}
                                />
                                <label
                                  htmlFor={`serialize-subject-${subject.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                >
                                  <span className="font-mono font-semibold">{subject.original_code}</span> - {subject.subject_name}
                                  {showDefaultSubjects && isDefaultSubject(subject.subject_code) && (
                                    <Badge variant="secondary" className="ml-2 text-xs">
                                      Default
                                    </Badge>
                                  )}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ELECTIVE Subjects */}
                      {groupedSerializationSubjects.elective.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">
                              ELECTIVE Subjects ({groupedSerializationSubjects.elective.length})
                            </p>
                          </div>
                          <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2 bg-muted/20">
                            {groupedSerializationSubjects.elective.map((subject) => (
                              <div key={subject.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`serialize-subject-${subject.id}`}
                                  checked={selectedSubjectCodes.has(subject.subject_code)}
                                  onCheckedChange={() => toggleSubjectSelection(subject.subject_code)}
                                  disabled={serializing || savingSelection}
                                />
                                <label
                                  htmlFor={`serialize-subject-${subject.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                >
                                  <span className="font-mono font-semibold">{subject.original_code}</span> - {subject.subject_name}
                                  {showDefaultSubjects && isDefaultSubject(subject.subject_code) && (
                                    <Badge variant="secondary" className="ml-2 text-xs">
                                      Default
                                    </Badge>
                                  )}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {filteredSerializationSubjects.length === 0 && subjects.length > 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No subjects match your search or filter criteria.</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-2 border-t">
                    <Button
                      onClick={handleSerialization}
                      disabled={serializing || savingSelection || subjects.length === 0 || selectedSubjectCodes.size === 0}
                      className="w-full sm:w-auto"
                    >
                      {serializing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Serializing...
                        </>
                      ) : (
                        <>
                          <Users className="h-4 w-4 mr-2" />
                          Serialize Candidates
                        </>
                      )}
                    </Button>
                    {selectedSubjectCodes.size > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Ready to serialize <strong>{selectedSubjectCodes.size}</strong> subject{selectedSubjectCodes.size !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  {serializationError && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">Serialization Failed</p>
                        <p className="text-sm text-destructive/80 mt-1">{serializationError}</p>
                      </div>
                    </div>
                  )}

                  {serializationResult && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-green-900 dark:text-green-100">
                              Serialization Complete
                            </p>
                            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                              {serializationResult.message}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSerializationResult(null);
                            setSerializationError(null);
                          }}
                        >
                          Dismiss
                        </Button>
                      </div>

                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-md bg-white dark:bg-gray-900/50 p-3 border border-green-200 dark:border-green-900/50">
                          <p className="text-xs text-green-600 dark:text-green-400 mb-1">Total Candidates</p>
                          <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                            {serializationResult.total_candidates_count.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-gray-900/50 p-3 border border-green-200 dark:border-green-900/50">
                          <p className="text-xs text-green-600 dark:text-green-400 mb-1">Total Schools</p>
                          <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                            {serializationResult.total_schools_count.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-gray-900/50 p-3 border border-green-200 dark:border-green-900/50">
                          <p className="text-xs text-green-600 dark:text-green-400 mb-1">Subjects Serialized</p>
                          <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                            {serializationResult.subjects_serialized_count}
                          </p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-gray-900/50 p-3 border border-green-200 dark:border-green-900/50">
                          <p className="text-xs text-green-600 dark:text-green-400 mb-1">Subjects Defaulted</p>
                          <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                            {serializationResult.subjects_defaulted_count}
                          </p>
                        </div>
                      </div>

                      {/* Serialized Subjects - Expandable */}
                      {serializationResult.subjects_processed.length > 0 && (
                        <div className="pt-2 border-t border-green-200 dark:border-green-900/50">
                          <button
                            onClick={() => setShowSerializedSubjects(!showSerializedSubjects)}
                            className="flex items-center gap-2 w-full text-left text-sm font-medium text-green-900 dark:text-green-100 hover:text-green-700 dark:hover:text-green-300 transition-colors py-2"
                          >
                            {showSerializedSubjects ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span>
                              Serialized Subjects ({serializationResult.subjects_processed.length})
                            </span>
                          </button>
                          {showSerializedSubjects && (
                            <div className="mt-2 max-h-64 overflow-y-auto">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-green-700 dark:text-green-300">
                                {serializationResult.subjects_processed.map((subject) => (
                                  <div
                                    key={subject.subject_id}
                                    className="flex items-center justify-between p-2 rounded bg-white dark:bg-gray-900/50 border border-green-100 dark:border-green-900/30"
                                  >
                                    <div>
                                      <span className="font-mono font-semibold">{getOriginalCode(subject.subject_code)}</span>
                                      <span className="ml-2">{subject.subject_name}</span>
                                    </div>
                                    <Badge variant="secondary" className="ml-2">
                                      {subject.candidates_count} candidate{subject.candidates_count !== 1 ? "s" : ""}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Defaulted Subjects - Expandable */}
                      {serializationResult.subjects_defaulted && serializationResult.subjects_defaulted.length > 0 && (
                        <div className="pt-2 border-t border-green-200 dark:border-green-900/50">
                          <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                            Defaulted Subjects ({serializationResult.subjects_defaulted.length})
                          </p>
                          <div className="max-h-32 overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-green-700 dark:text-green-300">
                              {serializationResult.subjects_defaulted.map((subject) => (
                                <div
                                  key={subject.subject_id}
                                  className="flex items-center justify-between p-2 rounded bg-white dark:bg-gray-900/50 border border-green-100 dark:border-green-900/30"
                                >
                                  <div>
                                    <span className="font-mono font-semibold">{getOriginalCode(subject.subject_code)}</span>
                                    <span className="ml-2">{subject.subject_name}</span>
                                  </div>
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Series 1
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="score-interpretation" className="mt-0">
              {/* Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total Subjects</p>
                        <p className="text-2xl font-semibold">{subjectStats.total}</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">CORE</p>
                        <p className="text-2xl font-semibold">{subjectStats.core}</p>
                      </div>
                      <Badge variant="default" className="text-xs">CORE</Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ELECTIVE</p>
                        <p className="text-2xl font-semibold">{subjectStats.elective}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">ELECTIVE</Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Complete</p>
                        <p className="text-2xl font-semibold text-green-600">{subjectStats.complete}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Incomplete</p>
                        <p className="text-2xl font-semibold text-orange-600">{subjectStats.incomplete}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Progress</p>
                        <p className="text-2xl font-semibold">{subjectStats.completionPercentage}%</p>
                      </div>
                      <div className="w-12 h-12 relative">
                        <svg className="w-12 h-12 transform -rotate-90">
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            className="text-muted"
                          />
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            strokeDasharray={`${(subjectStats.completionPercentage / 100) * 125.6} 125.6`}
                            className="text-primary"
                          />
                        </svg>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Search and Filter Controls */}
              <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by original code, code, or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Select value={subjectTypeFilter} onValueChange={(value: "ALL" | "CORE" | "ELECTIVE") => setSubjectTypeFilter(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="CORE">Core Only</SelectItem>
                    <SelectItem value="ELECTIVE">Elective Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={completionFilter} onValueChange={(value: "ALL" | "COMPLETE" | "INCOMPLETE") => setCompletionFilter(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Completion status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="COMPLETE">Complete Only</SelectItem>
                    <SelectItem value="INCOMPLETE">Incomplete Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value: "name" | "code" | "type" | "completion") => setSortBy(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                    <SelectItem value="completion">Completion Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Download Template, Upload Buttons, and View Toggle */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!downloadingTemplate || subjects.length === 0}
                      >
                        {downloadingTemplate ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Download Template
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Download Template</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDownloadTemplate()}
                        disabled={!!downloadingTemplate || subjects.length === 0}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>All Subjects</span>
                          <span className="text-xs text-muted-foreground">
                            {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDownloadTemplate("CORE")}
                        disabled={!!downloadingTemplate || subjectStats.core === 0}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>CORE Only</span>
                          <span className="text-xs text-muted-foreground">
                            {subjectStats.core} subject{subjectStats.core !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDownloadTemplate("ELECTIVE")}
                        disabled={!!downloadingTemplate || subjectStats.elective === 0}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>ELECTIVE Only</span>
                          <span className="text-xs text-muted-foreground">
                            {subjectStats.elective} subject{subjectStats.elective !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      {filteredSubjects.length > 0 && filteredSubjects.length < subjects.length && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              // Note: Currently downloads all subjects matching the type filter
                              // To download only filtered subjects, backend would need to support subject IDs parameter
                              toast.info("Filtered download coming soon. Currently downloading all subjects.");
                              handleDownloadTemplate();
                            }}
                            disabled={!!downloadingTemplate}
                          >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            <div className="flex flex-col">
                              <span>Filtered Subjects</span>
                              <span className="text-xs text-muted-foreground">
                                {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? "s" : ""} (coming soon)
                              </span>
                            </div>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Template includes all configured subject fields
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={() => setUploadDialogOpen(true)}
                    variant="default"
                    size="sm"
                    disabled={!examId}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-2 border rounded-md p-1">
                  <Button
                    variant={viewMode === "card" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("card")}
                    className="h-8"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="h-8"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Subjects Count */}
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredSubjects.length} of {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
                  {filteredSubjects.length !== subjects.length && (
                    <span className="ml-2 text-xs">
                      ({subjectStats.complete} complete, {subjectStats.incomplete} incomplete)
                    </span>
                  )}
                </div>
              </div>

              {/* Subjects Display - Grouped by Type */}
              {filteredSubjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">
                    {searchQuery || subjectTypeFilter !== "ALL" || completionFilter !== "ALL"
                      ? "No subjects match your filters"
                      : "No subjects found"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery || subjectTypeFilter !== "ALL" || completionFilter !== "ALL"
                      ? "Try adjusting your search or filter criteria"
                      : "Subjects will appear here once added to this examination"}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* CORE Subjects */}
                  {groupedSubjects.core.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Badge variant="default">CORE</Badge>
                          CORE Subjects ({groupedSubjects.core.length})
                        </h3>
                      </div>
                      {viewMode === "card" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch">
                          {groupedSubjects.core.map((subject) => (
                            <ExamSubjectCard
                              key={subject.id}
                              examSubject={subject}
                              onUpdate={handleSubjectUpdate}
                              isComplete={isSubjectComplete(subject)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {groupedSubjects.core.map((subject) => (
                            <ExamSubjectListItem
                              key={subject.id}
                              examSubject={subject}
                              onUpdate={handleSubjectUpdate}
                              isComplete={isSubjectComplete(subject)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ELECTIVE Subjects */}
                  {groupedSubjects.elective.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Badge variant="secondary">ELECTIVE</Badge>
                          ELECTIVE Subjects ({groupedSubjects.elective.length})
                        </h3>
                      </div>
                      {viewMode === "card" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch">
                          {groupedSubjects.elective.map((subject) => (
                            <ExamSubjectCard
                              key={subject.id}
                              examSubject={subject}
                              onUpdate={handleSubjectUpdate}
                              isComplete={isSubjectComplete(subject)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {groupedSubjects.elective.map((subject) => (
                            <ExamSubjectListItem
                              key={subject.id}
                              examSubject={subject}
                              onUpdate={handleSubjectUpdate}
                              isComplete={isSubjectComplete(subject)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="result-processing" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Process Subject Scores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select exam subjects to process. This will calculate normalized scores and final scores for all subject registrations under the selected exam subjects.
                  </p>

                  {/* Search and Filter */}
                  {subjects.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search by original code, code, or name..."
                          value={processingSearchQuery}
                          onChange={(e) => setProcessingSearchQuery(e.target.value)}
                          className="pl-9 pr-9"
                        />
                        {processingSearchQuery && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                            onClick={() => setProcessingSearchQuery("")}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Select
                        value={processingTypeFilter}
                        onValueChange={(value: "ALL" | "CORE" | "ELECTIVE") => setProcessingTypeFilter(value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Types</SelectItem>
                          <SelectItem value="CORE">Core Only</SelectItem>
                          <SelectItem value="ELECTIVE">Elective Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Selection Statistics */}
                  {subjects.length > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Selection Summary</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total:</span>{" "}
                          <span className="font-semibold">{processingSelectionStats.total}</span> / {processingSelectionStats.totalSubjects}
                        </div>
                        <div>
                          <span className="text-muted-foreground">CORE:</span>{" "}
                          <span className="font-semibold">{processingSelectionStats.core}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ELECTIVE:</span>{" "}
                          <span className="font-semibold">{processingSelectionStats.elective}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Progress:</span>{" "}
                          <span className="font-semibold">{processingSelectionStats.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {subjects.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-medium">Select Exam Subjects to Process</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedExamSubjectIds(new Set(subjects.map((s) => s.id)));
                            }}
                            disabled={processing}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const coreIds = new Set(subjects.filter((s) => s.subject_type === "CORE").map((s) => s.id));
                              setSelectedExamSubjectIds(coreIds);
                            }}
                            disabled={processing}
                          >
                            Select CORE
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const electiveIds = new Set(subjects.filter((s) => s.subject_type === "ELECTIVE").map((s) => s.id));
                              setSelectedExamSubjectIds(electiveIds);
                            }}
                            disabled={processing}
                          >
                            Select ELECTIVE
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const completeIds = new Set(subjects.filter((s) => isSubjectComplete(s)).map((s) => s.id));
                              setSelectedExamSubjectIds(completeIds);
                            }}
                            disabled={processing}
                          >
                            Select Complete
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedExamSubjectIds(new Set());
                            }}
                            disabled={processing}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedExamSubjectIds.size} of {subjects.length} exam subject{subjects.length !== 1 ? "s" : ""} selected
                      </p>

                      {/* Grouped Subject Selection */}
                      {filteredProcessingSubjects.length > 0 ? (
                        <div className="space-y-4">
                          {/* CORE Subjects */}
                          {groupedProcessingSubjects.core.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold flex items-center gap-2">
                                  <Badge variant="default">CORE</Badge>
                                  CORE Subjects ({groupedProcessingSubjects.core.length})
                                </p>
                              </div>
                              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2 bg-muted/20">
                                {groupedProcessingSubjects.core.map((subject) => (
                                  <div key={subject.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`exam-subject-${subject.id}`}
                                      checked={selectedExamSubjectIds.has(subject.id)}
                                      onCheckedChange={() => {
                                        setSelectedExamSubjectIds((prev) => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(subject.id)) {
                                            newSet.delete(subject.id);
                                          } else {
                                            newSet.add(subject.id);
                                          }
                                          return newSet;
                                        });
                                      }}
                                      disabled={processing}
                                    />
                                    <label
                                      htmlFor={`exam-subject-${subject.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                    >
                                      <span className="font-mono font-semibold">{subject.original_code || subject.subject_code}</span> - {subject.subject_name}
                                      {isSubjectComplete(subject) && (
                                        <span title="Complete configuration">
                                          <CheckCircle className="h-3 w-3 text-green-600 inline-block ml-2" />
                                        </span>
                                      )}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ELECTIVE Subjects */}
                          {groupedProcessingSubjects.elective.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold flex items-center gap-2">
                                  <Badge variant="secondary">ELECTIVE</Badge>
                                  ELECTIVE Subjects ({groupedProcessingSubjects.elective.length})
                                </p>
                              </div>
                              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2 bg-muted/20">
                                {groupedProcessingSubjects.elective.map((subject) => (
                                  <div key={subject.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`exam-subject-${subject.id}`}
                                      checked={selectedExamSubjectIds.has(subject.id)}
                                      onCheckedChange={() => {
                                        setSelectedExamSubjectIds((prev) => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(subject.id)) {
                                            newSet.delete(subject.id);
                                          } else {
                                            newSet.add(subject.id);
                                          }
                                          return newSet;
                                        });
                                      }}
                                      disabled={processing}
                                    />
                                    <label
                                      htmlFor={`exam-subject-${subject.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                    >
                                      <span className="font-mono font-semibold">{subject.original_code || subject.subject_code}</span> - {subject.subject_name}
                                      {isSubjectComplete(subject) && (
                                        <span title="Complete configuration">
                                          <CheckCircle className="h-3 w-3 text-green-600 inline-block ml-2" />
                                        </span>
                                      )}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
                          <ClipboardList className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {processingSearchQuery || processingTypeFilter !== "ALL"
                              ? "No subjects match your filters"
                              : "No subjects available"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        if (selectedExamSubjectIds.size === 0) {
                          toast.error("Please select at least one subject to process");
                          return;
                        }
                        setShowProcessingConfirm(true);
                      }}
                      disabled={processing || selectedExamSubjectIds.size === 0 || !examId}
                      className="w-full sm:w-auto"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Process Selected ({selectedExamSubjectIds.size})
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowProcessingConfirm(true);
                      }}
                      disabled={processing || !examId}
                      className="w-full sm:w-auto"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Process All
                    </Button>
                  </div>

                  {processingResult && (
                    <Card className={`${
                      processingResult.failed === 0
                        ? "border-green-200 dark:border-green-900/50"
                        : "border-yellow-200 dark:border-yellow-900/50"
                    }`}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            {processingResult.failed === 0 ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                            )}
                            Processing Complete
                          </CardTitle>
                          {processingResult.errors.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowProcessingErrors(!showProcessingErrors)}
                            >
                              {showProcessingErrors ? (
                                <>
                                  <ChevronDown className="h-4 w-4 mr-2" />
                                  Hide Errors
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="h-4 w-4 mr-2" />
                                  Show Errors ({processingResult.errors.length})
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          <div className={`rounded-lg p-3 ${
                            processingResult.failed === 0
                              ? "bg-green-50 dark:bg-green-950/20"
                              : "bg-yellow-50 dark:bg-yellow-950/20"
                          }`}>
                            <p className="text-xs text-muted-foreground mb-1">Total Processed</p>
                            <p className={`text-2xl font-semibold ${
                              processingResult.failed === 0
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}>
                              {processingResult.successful + processingResult.failed}
                            </p>
                          </div>
                          <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
                            <p className="text-xs text-muted-foreground mb-1">Successful</p>
                            <p className="text-2xl font-semibold text-green-600">
                              {processingResult.successful}
                            </p>
                          </div>
                          {processingResult.failed > 0 && (
                            <div className="rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
                              <p className="text-xs text-muted-foreground mb-1">Failed</p>
                              <p className="text-2xl font-semibold text-red-600">
                                {processingResult.failed}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Error Details - Expandable */}
                        {processingResult.errors.length > 0 && showProcessingErrors && (
                          <div className="border rounded-lg p-4 bg-muted/50">
                            <p className="text-sm font-medium mb-3">Error Details</p>
                            <div className="max-h-64 overflow-y-auto space-y-2">
                              {processingResult.errors.map((error, idx) => (
                                <div key={idx} className="text-sm p-2 rounded bg-background border">
                                  <p className="font-mono text-xs text-muted-foreground mb-1">
                                    Registration ID: {error.subject_registration_id}
                                  </p>
                                  <p className="text-red-600 dark:text-red-400">{error.error}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="insights" className="mt-0">
              <SubjectInsightsPlayground examId={examId!} subjects={subjects} />
            </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>

      <ExamInfoDrawer
        exam={exam}
        open={infoDrawerOpen}
        onOpenChange={setInfoDrawerOpen}
        onSuccess={handleEditSuccess}
      />

      {examId && (
        <ExamSubjectBulkUpload
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          examId={examId}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Serialization Confirmation Dialog */}
      <AlertDialog open={showSerializationConfirm} onOpenChange={setShowSerializationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Serialization</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to serialize candidates for <strong>{selectedSubjectCodes.size}</strong> subject{selectedSubjectCodes.size !== 1 ? "s" : ""}.
              Selected subjects will have candidates assigned series numbers (1 to {exam?.number_of_series || 1}) in round-robin fashion.
              Unselected subjects will have all candidates assigned a default series of 1.
              <br />
              <br />
              This operation will overwrite any existing series assignments. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSerialization}>
              <Users className="h-4 w-4 mr-2" />
              Serialize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Processing Confirmation Dialog */}
      <AlertDialog open={showProcessingConfirm} onOpenChange={setShowProcessingConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Processing</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedExamSubjectIds.size > 0 ? (
                <>
                  You are about to process scores for <strong>{selectedExamSubjectIds.size}</strong> exam subject{selectedExamSubjectIds.size !== 1 ? "s" : ""}.
                  This will calculate normalized scores and final scores for all subject registrations under the selected exam subjects.
                </>
              ) : (
                <>
                  You are about to process scores for <strong>all</strong> exam subjects in this examination.
                  This will calculate normalized scores and final scores for all subject registrations.
                </>
              )}
              <br />
              <br />
              This operation may take some time depending on the number of registrations. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowProcessingConfirm(false);
                if (!examId) return;

                setProcessing(true);
                setProcessingResult(null);
                try {
                  let result;
                  if (selectedExamSubjectIds.size > 0) {
                    result = await processExamSubjects(Array.from(selectedExamSubjectIds));
                  } else {
                    result = await processExamResults(examId);
                  }
                  setProcessingResult({
                    successful: result.successful,
                    failed: result.failed,
                    errors: result.errors || [],
                  });
                  if (result.failed === 0) {
                    toast.success(`Successfully processed ${result.successful} subject score(s)`);
                  } else {
                    toast.warning(`Processed ${result.successful} successfully, ${result.failed} failed`);
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to process results");
                } finally {
                  setProcessing(false);
                }
              }}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Process
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
