"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ExamSubjectCard } from "@/components/ExamSubjectCard";
import { ExamSubjectListItem } from "@/components/ExamSubjectListItem";
import { EditExamModal } from "@/components/EditExamModal";
import { ExamSubjectBulkUpload } from "@/components/ExamSubjectBulkUpload";
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
import { getExam, listExamSubjects, serializeExam, downloadExamSubjectTemplate, type ExamSubject, type SerializationResponse } from "@/lib/api";
import type { Exam } from "@/types/document";
import { ArrowLeft, Search, X, ClipboardList, Edit, Calendar, Users, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight, Download, Upload, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ExaminationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id ? parseInt(params.id as string) : null;

  const [exam, setExam] = useState<Exam | null>(null);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [serializing, setSerializing] = useState(false);
  const [serializationResult, setSerializationResult] = useState<SerializationResponse | null>(null);
  const [serializationError, setSerializationError] = useState<string | null>(null);
  const [selectedSubjectCodes, setSelectedSubjectCodes] = useState<Set<string>>(new Set());
  const [showSerializedSubjects, setShowSerializedSubjects] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("serialization");
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

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

  // Filter subjects based on search and type filter
  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        subject.subject_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType =
        subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [subjects, searchQuery, subjectTypeFilter]);

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
    setEditModalOpen(false);
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
      const filename = subjectType
        ? `exam_${examId}_subjects_${subjectType.toLowerCase()}_template.xlsx`
        : `exam_${examId}_subjects_template.xlsx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download template";
      toast.error(errorMessage);
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const handleSerialization = async () => {
    if (!examId) return;

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

  const toggleSubjectSelection = (subjectCode: string) => {
    setSelectedSubjectCodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(subjectCode)) {
        newSet.delete(subjectCode);
      } else {
        newSet.add(subjectCode);
      }
      return newSet;
    });
  };

  const selectAllSubjects = () => {
    setSelectedSubjectCodes(new Set(subjects.map((s) => s.subject_code)));
  };

  const clearSubjectSelection = () => {
    setSelectedSubjectCodes(new Set());
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
        <div className="flex-1 overflow-y-auto py-6 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-4">
          <div className="max-w-full lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[5/6] mx-auto">
            {/* Header with back button */}
            <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/examinations")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Examinations
            </Button>
          </div>

          {/* Exam Information Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Examination Information
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalOpen(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Exam Type:</span>
                  <span className="text-sm font-medium">{exam.exam_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Year:</span>
                  <span className="text-sm font-medium">{exam.year}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Series:</span>
                  <span className="text-sm font-medium">{exam.series}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Number of Series:</span>
                  <span className="text-sm font-medium">{exam.number_of_series}</span>
                </div>
                {exam.description && (
                  <div className="flex items-start gap-2 md:col-span-2">
                    <span className="text-sm text-muted-foreground">Description:</span>
                    <span className="text-sm font-medium">{exam.description}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Created:</span>
                  <span className="text-sm font-medium">
                    {new Date(exam.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="serialization"
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Serialization
              </TabsTrigger>
              <TabsTrigger
                value="score-interpretation"
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Score interpretation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="serialization" className="mt-6">
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

                  {/* Subject Selection */}
                  {subjects.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Select Subjects to Serialize</p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={selectAllSubjects}
                            disabled={serializing}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearSubjectSelection}
                            disabled={serializing}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                        {subjects.map((subject) => (
                          <div key={subject.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`subject-${subject.id}`}
                              checked={selectedSubjectCodes.has(subject.subject_code)}
                              onCheckedChange={() => toggleSubjectSelection(subject.subject_code)}
                              disabled={serializing}
                            />
                            <label
                              htmlFor={`subject-${subject.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              <span className="font-mono font-semibold">{subject.subject_code}</span> - {subject.subject_name}
                              <span className="ml-2 text-xs text-muted-foreground">({subject.subject_type})</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedSubjectCodes.size} of {subjects.length} subject{subjects.length !== 1 ? "s" : ""} selected
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleSerialization}
                    disabled={serializing || subjects.length === 0}
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
                      <div className="flex items-start gap-3">
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

                      {/* Summary */}
                      <div className="pt-2 border-t border-green-200 dark:border-green-900/50">
                        <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-3">
                          Summary
                        </p>
                        <div className="grid grid-cols-2 gap-4 text-sm text-green-700 dark:text-green-300">
                          <div>
                            <span className="font-medium">Total Candidates:</span>{" "}
                            {serializationResult.total_candidates_count}
                          </div>
                          <div>
                            <span className="font-medium">Total Schools:</span>{" "}
                            {serializationResult.total_schools_count}
                          </div>
                          <div>
                            <span className="font-medium">Subjects Serialized:</span>{" "}
                            {serializationResult.subjects_serialized_count}
                          </div>
                          <div>
                            <span className="font-medium">Subjects Defaulted:</span>{" "}
                            {serializationResult.subjects_defaulted_count}
                          </div>
                        </div>
                      </div>

                      {/* Serialized Subjects - Accordion */}
                      {serializationResult.subjects_processed.length > 0 && (
                        <div className="pt-2 border-t border-green-200 dark:border-green-900/50">
                          <button
                            onClick={() => setShowSerializedSubjects(!showSerializedSubjects)}
                            className="flex items-center gap-2 w-full text-left text-sm font-medium text-green-900 dark:text-green-100 hover:text-green-700 dark:hover:text-green-300 transition-colors"
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
                            <div className="mt-2 max-h-48 overflow-y-auto space-y-1 text-sm text-green-700 dark:text-green-300 pl-6">
                              {serializationResult.subjects_processed.map((subject) => (
                                <p key={subject.subject_id} className="truncate">
                                  {subject.subject_code} - {subject.subject_name}: {subject.candidates_count} candidate{subject.candidates_count !== 1 ? "s" : ""}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="score-interpretation" className="mt-6">
              {/* Search and Filter Controls */}
              <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search subjects by code or name..."
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
                    <SelectItem value="ALL">All Subjects</SelectItem>
                    <SelectItem value="CORE">Core Only</SelectItem>
                    <SelectItem value="ELECTIVE">Elective Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Download Template, Upload Buttons, and View Toggle */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => handleDownloadTemplate()}
                    variant="outline"
                    size="sm"
                    disabled={!!downloadingTemplate}
                  >
                    {downloadingTemplate === "all" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Template (All)
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDownloadTemplate("CORE")}
                    variant="outline"
                    size="sm"
                    disabled={!!downloadingTemplate}
                  >
                    {downloadingTemplate === "CORE" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Template (Core)
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDownloadTemplate("ELECTIVE")}
                    variant="outline"
                    size="sm"
                    disabled={!!downloadingTemplate}
                  >
                    {downloadingTemplate === "ELECTIVE" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Template (Elective)
                      </>
                    )}
                  </Button>
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
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {filteredSubjects.length} of {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
              </div>

              {/* Subjects Display */}
              {filteredSubjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">
                    {searchQuery || subjectTypeFilter !== "ALL"
                      ? "No subjects match your filters"
                      : "No subjects found"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery || subjectTypeFilter !== "ALL"
                      ? "Try adjusting your search or filter criteria"
                      : "Subjects will appear here once added to this examination"}
                  </p>
                </div>
              ) : viewMode === "card" ? (
                <div className="grid grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch">
                  {filteredSubjects.map((subject) => (
                    <ExamSubjectCard
                      key={subject.id}
                      examSubject={subject}
                      onUpdate={handleSubjectUpdate}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSubjects.map((subject) => (
                    <ExamSubjectListItem
                      key={subject.id}
                      examSubject={subject}
                      onUpdate={handleSubjectUpdate}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </div>

      <EditExamModal
        exam={exam}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
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
    </DashboardLayout>
  );
}
