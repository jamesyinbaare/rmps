"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getCandidatesForManualEntry,
  getAllExams,
  listProgrammes,
  listSubjects,
  findExamId,
  listSchools,
  listSchoolProgrammes,
  listProgrammeSubjects,
  exportCandidateResults
} from "@/lib/api";
import type { Exam, Programme, Subject, School, ManualEntryFilters, CandidateScoreEntry, ExamType, ExamSeries, ExportFormat, TestType } from "@/types/document";
import { Loader2, Download, Search, X, Filter, FileText, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

// Available export fields grouped by category
const EXPORT_FIELDS = {
  candidate: [
    { id: "candidate_name", label: "Candidate Name" },
    { id: "candidate_index_number", label: "Index Number" },
  ],
  school: [
    { id: "school_name", label: "School Name" },
    { id: "school_code", label: "School Code" },
  ],
  exam: [
    { id: "exam_name", label: "Exam Name" },
    { id: "exam_type", label: "Exam Type" },
    { id: "exam_year", label: "Exam Year" },
    { id: "exam_series", label: "Exam Series" },
  ],
  programme: [
    { id: "programme_name", label: "Programme Name" },
    { id: "programme_code", label: "Programme Code" },
  ],
  subject: [
    { id: "subject_name", label: "Subject Name" },
    { id: "subject_code", label: "Subject Code" },
    { id: "subject_series", label: "Subject Series" },
  ],
  rawScores: [
    { id: "obj_raw_score", label: "Objectives Raw Score" },
    { id: "essay_raw_score", label: "Essay Raw Score" },
    { id: "pract_raw_score", label: "Practical Raw Score" },
  ],
  normalizedScores: [
    { id: "obj_normalized", label: "Objectives Normalized" },
    { id: "essay_normalized", label: "Essay Normalized" },
    { id: "pract_normalized", label: "Practical Normalized" },
  ],
  results: [
    { id: "total_score", label: "Total Score" },
    { id: "grade", label: "Grade" },
  ],
  documentIds: [
    { id: "obj_document_id", label: "Objectives Document ID" },
    { id: "essay_document_id", label: "Essay Document ID" },
    { id: "pract_document_id", label: "Practical Document ID" },
  ],
  metadata: [
    { id: "created_at", label: "Created At" },
    { id: "updated_at", label: "Updated At" },
  ],
};

export default function ExportResultsPage() {
  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<ManualEntryFilters>({
    page: 1,
    page_size: 100, // Default page size for export preview
  });
  const [pendingFilters, setPendingFilters] = useState<ManualEntryFilters>({
    page: 1,
    page_size: 100,
  });
  const [customPageSize, setCustomPageSize] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);

  // Exam selection state (single select)
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>();

  // Subject type selection state
  const [subjectType, setSubjectType] = useState<"CORE" | "ELECTIVE" | null>(null);

  // Export format selection state
  const [exportFormat, setExportFormat] = useState<ExportFormat>("standard");
  const [testType, setTestType] = useState<TestType>("obj");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<number>>(new Set());

  // Field selection state
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set([
      "candidate_name",
      "candidate_index_number",
      "school_name",
      "subject_name",
      "subject_code",
      "obj_raw_score",
      "essay_raw_score",
      "pract_raw_score",
      "total_score",
      "grade",
    ])
  );

  // Collapsible state
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const [examsData, schoolsData, subjectsData] = await Promise.all([
          getAllExams(),
          (async () => {
            const allSchools: School[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const schoolsPage = await listSchools(page, 100);
              allSchools.push(...schoolsPage);
              hasMore = schoolsPage.length === 100;
              page++;
            }
            return allSchools;
          })(),
          (async () => {
            const allSubjects: Subject[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const subjectsPage = await listSubjects(page, 100);
              allSubjects.push(...subjectsPage);
              hasMore = subjectsPage.length === 100;
              page++;
            }
            return allSubjects;
          })(),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        setAllSubjects(subjectsData);
        setSubjects([]);
        setProgrammes([]);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  // Load programmes when school is selected or when ELECTIVE subject type is selected
  useEffect(() => {
    async function loadProgrammes() {
      // If ELECTIVE is selected, we need programmes (can load all or from school)
      // If school is selected, load programmes for that school
      // Otherwise, clear programmes
      if (subjectType === "ELECTIVE") {
        setLoadingProgrammes(true);
        try {
          let programmesData: Programme[] = [];
          if (pendingFilters.school_id) {
            // Load programmes for the selected school
            programmesData = await listSchoolProgrammes(pendingFilters.school_id);
          } else {
            // Load all programmes when ELECTIVE is selected but no school
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const programmesPage = await listProgrammes(page, 100);
              programmesData.push(...programmesPage.items);
              hasMore = page < programmesPage.total_pages;
              page++;
            }
          }
          setProgrammes(programmesData);
          setPendingFilters((prev) => ({
            ...prev,
            programme_id: undefined,
          }));
        } catch (err) {
          console.error("Error loading programmes:", err);
        } finally {
          setLoadingProgrammes(false);
        }
      } else if (pendingFilters.school_id) {
        // Load programmes for school when school is selected (but not ELECTIVE)
        setLoadingProgrammes(true);
        try {
          const programmesData = await listSchoolProgrammes(pendingFilters.school_id);
          setProgrammes(programmesData);
          setPendingFilters((prev) => ({
            ...prev,
            programme_id: undefined,
          }));
        } catch (err) {
          console.error("Error loading programmes for school:", err);
        } finally {
          setLoadingProgrammes(false);
        }
      } else {
        // Clear programmes if no school and not ELECTIVE
        setProgrammes([]);
        setSubjects([]);
      }
    }
    loadProgrammes();
  }, [pendingFilters.school_id, subjectType]);

  // Load subjects when school/programme is selected (optional)
  useEffect(() => {
    async function loadSubjectsForSchoolAndProgramme() {
      // If no school is selected, show all subjects (for exam-wide exports)
      if (!pendingFilters.school_id) {
        setSubjects(allSubjects);
        return;
      }

      setLoadingSubjects(true);
      try {
        let subjectsToShow: Subject[] = [];

        if (pendingFilters.programme_id) {
          const programmeSubjects = await listProgrammeSubjects(pendingFilters.programme_id);
          const programmeSubjectIds = new Set(programmeSubjects.map(ps => ps.subject_id));
          subjectsToShow = allSubjects.filter(subject => programmeSubjectIds.has(subject.id));
        } else {
          subjectsToShow = allSubjects;
        }

        setSubjects(subjectsToShow);
      } catch (err) {
        console.error("Error loading subjects:", err);
        setSubjects(allSubjects);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjectsForSchoolAndProgramme();
  }, [pendingFilters.school_id, pendingFilters.programme_id, allSubjects]);

  // Load candidates
  const loadCandidates = useCallback(async () => {
    // Exam is always required
    if (!filters.exam_id) {
      setCandidates([]);
      setTotal(0);
      setTotalPages(0);
      setCurrentPage(1);
      return;
    }

    // For preview, if subject_type is selected (CORE or ELECTIVE),
    // school and subject are not required
    if (subjectType === "CORE" || subjectType === "ELECTIVE") {
      // Allow preview without school/subject for subject type exports
    } else if (filters.document_id) {
      // Document ID search requires exam filters only (already checked above)
    } else if (filters.subject_id) {
      // Specific subject selected - allow preview
    } else {
      // No specific filters - show empty
      setCandidates([]);
      setTotal(0);
      setTotalPages(0);
      setCurrentPage(1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getCandidatesForManualEntry(filters);
      setCandidates(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
      console.error("Error loading candidates:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, subjectType]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Update pending filters when exam is selected (don't auto-update active filters)
  useEffect(() => {
    if (selectedExamId) {
      setPendingFilters((prev) => ({
        ...prev,
        exam_id: selectedExamId,
        exam_type: undefined,
        series: undefined,
        year: undefined,
        page: 1,
      }));
    } else {
      setPendingFilters((prev) => ({
        ...prev,
        exam_id: undefined,
        exam_type: undefined,
        series: undefined,
        year: undefined,
        page: 1,
      }));
    }
  }, [selectedExamId]);

  const handleFilterChange = (key: keyof ManualEntryFilters, value: number | string | undefined) => {
    setPendingFilters((prev) => {
      const newFilters = {
        ...prev,
        [key]: value,
        page: 1,
      };

      if (key === "school_id") {
        newFilters.programme_id = undefined;
        newFilters.subject_id = undefined;
        setProgrammes([]);
        setSubjects([]);
      }
      if (key === "programme_id") {
        newFilters.subject_id = undefined;
      }

      return newFilters;
    });
  };

  const handleSearch = () => {
    const searchFilters: ManualEntryFilters = {
      ...pendingFilters,
      page: 1,
    };

    // Ensure exam_id is set from selectedExamId
    if (selectedExamId) {
      searchFilters.exam_id = selectedExamId;
      searchFilters.exam_type = undefined;
      searchFilters.series = undefined;
      searchFilters.year = undefined;
    }

    // Add subject_type to filters if selected
    if (subjectType) {
      searchFilters.subject_type = subjectType;
      // Clear subject_id when subject_type is set (they're mutually exclusive)
      searchFilters.subject_id = undefined;
    } else {
      searchFilters.subject_type = undefined;
    }

    setFilters(searchFilters);
    setPendingFilters(searchFilters);
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    setSubjectType(null);
    setCustomPageSize("");
    setShowCustomInput(false);
    setPendingFilters({
      page: 1,
      page_size: 100,
    });
    setFilters({
      page: 1,
      page_size: 100,
    });
    setProgrammes([]);
    setSubjects([]);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
    setPendingFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
    setShowCustomInput(false);
    setCustomPageSize("");
  };

  const handleCustomPageSizeSubmit = () => {
    const size = parseInt(customPageSize, 10);
    if (size > 0 && size <= 10000) {
      handlePageSizeChange(size);
    } else {
      toast.error("Page size must be between 1 and 10000");
      setCustomPageSize("");
    }
  };

  const handleExamChange = (value: number | string | undefined) => {
    if (value === "" || value === undefined || value === null) {
      setSelectedExamId(undefined);
    } else {
      const examId = typeof value === "number" ? value : parseInt(value.toString(), 10);
      setSelectedExamId(isNaN(examId) ? undefined : examId);
    }
  };

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFields((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  const handleSelectAllFields = (category: keyof typeof EXPORT_FIELDS) => {
    const categoryFields = EXPORT_FIELDS[category].map((f) => f.id);
    setSelectedFields((prev) => {
      const newSet = new Set(prev);
      const allSelected = categoryFields.every((f) => newSet.has(f));
      if (allSelected) {
        categoryFields.forEach((f) => newSet.delete(f));
      } else {
        categoryFields.forEach((f) => newSet.add(f));
      }
      return newSet;
    });
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) {
      toast.error("Please select at least one field to export");
      return;
    }

    if (!filters.exam_id) {
      toast.error("Please select an examination before exporting");
      return;
    }

    // Validation for standard format
    if (exportFormat === "standard") {
      // Validate filter combinations
      if (subjectType && filters.subject_id) {
        toast.error("Cannot select both subject type and specific subject. Please choose one.");
        return;
      }

      // For ELECTIVE subject type, require programme
      if (subjectType === "ELECTIVE" && !filters.programme_id) {
        toast.error("Please select a programme for elective subjects export");
        return;
      }

      // If no subject type and no subject selected, show error
      if (!subjectType && !filters.subject_id) {
        toast.error("Please select either a subject type (CORE/ELECTIVE) or a specific subject");
        return;
      }
    }

    // Validation for multi-subject format
    if (exportFormat === "multi_subject") {
      // Test type is always required (has default value, but validate anyway)
      if (!testType) {
        toast.error("Please select a test type (Objectives or Essay)");
        return;
      }

      // Either subject type or specific subjects must be selected
      if (subjectType === null && selectedSubjectIds.size === 0) {
        toast.error("Please select either a subject type or specific subjects for multi-subject export");
        return;
      }

      // Cannot have both subject type and specific subjects
      if (subjectType !== null && selectedSubjectIds.size > 0) {
        toast.error("Please select either subject type OR specific subjects, not both");
        return;
      }

      // For ELECTIVE subject type, require programme
      if (subjectType === "ELECTIVE" && !filters.programme_id) {
        toast.error("Please select a programme for elective subjects export");
        return;
      }
    }

    setExporting(true);
    try {
      // Filter fields based on export format
      let fieldsToExport = Array.from(selectedFields);
      if (exportFormat === "multi_subject") {
        // Only allow candidate info fields for multi-subject format
        const allowedFields = [
          "candidate_name",
          "candidate_index_number",
          "school_name",
          "school_code",
          "exam_name",
          "exam_type",
          "exam_year",
          "exam_series",
          "programme_name",
          "programme_code",
        ];
        fieldsToExport = fieldsToExport.filter((field) => allowedFields.includes(field));

        if (fieldsToExport.length === 0) {
          toast.error("Please select at least one valid candidate info field for multi-subject export");
          setExporting(false);
          return;
        }
      }

      const subjectIdsArray = selectedSubjectIds.size > 0 ? Array.from(selectedSubjectIds) : undefined;
      // For multi-subject format: if subjectIds are selected, don't pass subjectType; otherwise pass subjectType
      // For standard format: pass subjectType as before
      let exportSubjectType: "CORE" | "ELECTIVE" | undefined = undefined;
      if (exportFormat === "standard") {
        exportSubjectType = subjectType || undefined;
      } else if (exportFormat === "multi_subject" && subjectIdsArray === undefined && subjectType !== null) {
        exportSubjectType = subjectType;
      }

      await exportCandidateResults(
        filters,
        fieldsToExport,
        exportSubjectType,
        exportFormat,
        exportFormat === "multi_subject" ? testType : undefined,
        exportFormat === "multi_subject" ? subjectIdsArray : undefined
      );
      toast.success("Export started successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export results");
      console.error("Error exporting:", err);
    } finally {
      setExporting(false);
    }
  };

  const getFieldLabel = (fieldId: string): string => {
    for (const category of Object.values(EXPORT_FIELDS)) {
      const field = category.find((f) => f.id === fieldId);
      if (field) return field.label;
    }
    return fieldId;
  };

  // Get visible columns based on selected fields
  const visibleColumns = candidates.length > 0
    ? Array.from(selectedFields).filter((fieldId) => {
        const candidate = candidates[0];
        // Map field IDs to candidate properties for preview
        return true; // Show all selected fields in preview
      })
    : [];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Export Candidate Results" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <Card>
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CardHeader>
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters
                  </CardTitle>
                  {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Examination <span className="text-red-500">*</span></label>
                      <SearchableSelect
                        options={exams
                          .sort((a, b) => {
                            // Sort by year (desc), then series, then type
                            if (b.year !== a.year) return b.year - a.year;
                            if (a.series !== b.series) return a.series.localeCompare(b.series);
                            return a.exam_type.localeCompare(b.exam_type);
                          })
                          .map((exam) => {
                            // Format exam type for display
                            let examTypeDisplay = exam.exam_type;
                            if (exam.exam_type === "Certificate II Examination" || exam.exam_type === "Certificate II Examinations") {
                              examTypeDisplay = "Certificate II";
                            }
                            // Format: {year} {series} {type}
                            return {
                              value: exam.id,
                              label: `${exam.year} ${exam.series} ${examTypeDisplay}`,
                            };
                          })}
                        value={selectedExamId || ""}
                        onValueChange={handleExamChange}
                        placeholder="Search examination..."
                        disabled={loadingFilters}
                        allowAll={false}
                        searchPlaceholder="Search by year, series, or type..."
                        emptyMessage="No examinations found"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">School (optional)</label>
                      <SearchableSelect
                        options={schools.map((school) => ({
                          value: school.id,
                          label: `${school.code} - ${school.name}`,
                        }))}
                        value={pendingFilters.school_id || ""}
                        onValueChange={(value) => {
                          if (value === "" || value === undefined) {
                            handleFilterChange("school_id", undefined);
                          } else {
                            handleFilterChange("school_id", typeof value === "number" ? value : parseInt(value.toString(), 10));
                          }
                        }}
                        placeholder="All Schools (optional)"
                        disabled={loadingFilters}
                        allowAll={true}
                        searchPlaceholder="Search schools..."
                        emptyMessage="No schools found"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Subject Type
                      </label>
                      <Select
                        value={subjectType || ""}
                        onValueChange={(value) => {
                          if (value === "" || value === "none") {
                            setSubjectType(null);
                            // Clear subject_id if subject type is cleared
                            handleFilterChange("subject_id", undefined);
                          } else {
                            setSubjectType(value as "CORE" | "ELECTIVE");
                            // Clear subject_id when subject type is selected
                            handleFilterChange("subject_id", undefined);
                          }
                        }}
                        disabled={loadingFilters}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select subject type (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="CORE">Core Subjects</SelectItem>
                          <SelectItem value="ELECTIVE">Elective Subjects</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Programme {subjectType === "ELECTIVE" && <span className="text-red-500">*</span>}
                      </label>
                      <Select
                        value={pendingFilters.programme_id?.toString() || ""}
                        onValueChange={(value) => handleFilterChange("programme_id", value && value !== "all" ? parseInt(value) : undefined)}
                        disabled={loadingFilters || loadingProgrammes || (subjectType !== "ELECTIVE")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={subjectType === "ELECTIVE" ? "Select programme (required)" : "All programmes (optional)"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Programmes</SelectItem>
                          {programmes.map((programme) => (
                            <SelectItem key={programme.id} value={programme.id.toString()}>
                              {programme.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Subject {subjectType ? "(disabled when subject type selected)" : "(optional)"}
                      </label>
                      <SearchableSelect
                        options={subjects.map((subject) => ({
                          value: subject.id,
                          label: `${subject.code} - ${subject.name}`,
                        }))}
                        value={pendingFilters.subject_id || ""}
                        onValueChange={(value) => {
                          if (value === "" || value === undefined) {
                            handleFilterChange("subject_id", undefined);
                          } else {
                            handleFilterChange("subject_id", typeof value === "number" ? value : parseInt(value.toString(), 10));
                            // Clear subject type when specific subject is selected
                            setSubjectType(null);
                          }
                        }}
                        placeholder="Select specific subject (optional)"
                        disabled={loadingFilters || loadingSubjects || !!subjectType}
                        allowAll={false}
                        searchPlaceholder="Search subjects..."
                        emptyMessage="No subjects found"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button onClick={handleSearch} disabled={loading}>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                    <Button variant="outline" onClick={handleClearFilters}>
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Export Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Export Format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Format Type</label>
                  <Select
                    value={exportFormat}
                    onValueChange={(value) => {
                      const newFormat = value as ExportFormat;
                      setExportFormat(newFormat);

                      if (newFormat === "standard") {
                        // Reset multi-subject specific selections when switching to standard
                        setSelectedSubjectIds(new Set());
                        setTestType("obj");
                      } else if (newFormat === "multi_subject") {
                        // Remove invalid fields when switching to multi-subject format
                        const invalidFields = [
                          "subject_name",
                          "subject_code",
                          "subject_series",
                          "obj_raw_score",
                          "essay_raw_score",
                          "pract_raw_score",
                          "obj_normalized",
                          "essay_normalized",
                          "pract_normalized",
                          "total_score",
                          "grade",
                          "obj_document_id",
                          "essay_document_id",
                          "pract_document_id",
                        ];
                        setSelectedFields((prev) => {
                          const newSet = new Set(prev);
                          invalidFields.forEach((field) => newSet.delete(field));
                          return newSet;
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Format</SelectItem>
                      <SelectItem value="multi_subject">Multi-Subject Format</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {exportFormat === "standard"
                      ? "Traditional format with one row per candidate-subject combination"
                      : "Multiple subjects on same sheet with subject codes as column headers"}
                  </p>
                </div>

                {exportFormat === "multi_subject" && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Test Type <span className="text-red-500">*</span>
                      </label>
                      <Select value={testType} onValueChange={(value) => setTestType(value as TestType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="obj">Objectives (OBJ)</SelectItem>
                          <SelectItem value="essay">Essay</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Select which raw score type to export for each subject
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Subject Selection <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="subjectSelection"
                              checked={subjectType !== null}
                              onChange={() => {
                                setSelectedSubjectIds(new Set());
                                if (subjectType === null) setSubjectType("CORE");
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">By Subject Type</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="subjectSelection"
                              checked={subjectType === null && selectedSubjectIds.size > 0}
                              onChange={() => {
                                setSubjectType(null);
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Select Specific Subjects</span>
                          </label>
                        </div>

                        {subjectType !== null ? (
                          <div className="space-y-2">
                            <Select
                              value={subjectType || ""}
                              onValueChange={(value) => {
                                setSubjectType(value as "CORE" | "ELECTIVE");
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select subject type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CORE">CORE</SelectItem>
                                <SelectItem value="ELECTIVE">ELECTIVE</SelectItem>
                              </SelectContent>
                            </Select>
                            {subjectType === "ELECTIVE" && (
                              <p className="text-xs text-muted-foreground">
                                Programme selection is required for ELECTIVE subjects
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="border rounded-md p-4 max-h-60 overflow-y-auto">
                            {loadingSubjects ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading subjects...</span>
                              </div>
                            ) : allSubjects.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Please select an examination first</p>
                            ) : (
                              <div className="space-y-2">
                                {allSubjects
                                  .filter((subject) => {
                                    // Filter subjects based on exam if available
                                    if (!filters.exam_id) return true;
                                    // For now, show all subjects - could be filtered by exam subjects
                                    return true;
                                  })
                                  .map((subject) => (
                                    <div key={subject.id} className="flex items-center gap-2">
                                      <Checkbox
                                        checked={selectedSubjectIds.has(subject.id)}
                                        onCheckedChange={(checked) => {
                                          setSelectedSubjectIds((prev) => {
                                            const newSet = new Set(prev);
                                            if (checked) {
                                              newSet.add(subject.id);
                                            } else {
                                              newSet.delete(subject.id);
                                            }
                                            return newSet;
                                          });
                                        }}
                                      />
                                      <label className="text-sm cursor-pointer">
                                        {subject.code} - {subject.name}
                                      </label>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Field Selection */}
          <Card>
            <Collapsible open={fieldsOpen} onOpenChange={setFieldsOpen}>
              <CardHeader>
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Select Fields to Export ({selectedFields.size})
                  </CardTitle>
                  {fieldsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {Object.entries(EXPORT_FIELDS).map(([categoryKey, categoryFields]) => {
                    // Filter out subject-specific fields for multi-subject format
                    const filteredFields = exportFormat === "multi_subject"
                      ? categoryFields.filter((f) => {
                          // Exclude subject-specific fields
                          return !["subject_name", "subject_code", "subject_series"].includes(f.id) &&
                                 !f.id.includes("raw_score") &&
                                 !f.id.includes("normalized") &&
                                 !f.id.includes("total_score") &&
                                 !f.id.includes("grade") &&
                                 !f.id.includes("document_id");
                        })
                      : categoryFields;

                    if (filteredFields.length === 0) return null;

                    const categoryLabel = categoryKey
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (str) => str.toUpperCase());
                    const allSelected = filteredFields.every((f) => selectedFields.has(f.id));
                    const someSelected = filteredFields.some((f) => selectedFields.has(f.id));

                      return (
                        <div key={categoryKey} className="space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <Checkbox
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !allSelected;
                              }}
                              onCheckedChange={() => {
                                // Only toggle filtered fields
                                const filteredFieldIds = filteredFields.map((f) => f.id);
                                setSelectedFields((prev) => {
                                  const newSet = new Set(prev);
                                  const allSelected = filteredFieldIds.every((f) => newSet.has(f));
                                  if (allSelected) {
                                    filteredFieldIds.forEach((f) => newSet.delete(f));
                                  } else {
                                    filteredFieldIds.forEach((f) => newSet.add(f));
                                  }
                                  return newSet;
                                });
                              }}
                            />
                            <label
                              className="text-sm font-medium cursor-pointer"
                              onClick={() => {
                                const filteredFieldIds = filteredFields.map((f) => f.id);
                                setSelectedFields((prev) => {
                                  const newSet = new Set(prev);
                                  const allSelected = filteredFieldIds.every((f) => newSet.has(f));
                                  if (allSelected) {
                                    filteredFieldIds.forEach((f) => newSet.delete(f));
                                  } else {
                                    filteredFieldIds.forEach((f) => newSet.add(f));
                                  }
                                  return newSet;
                                });
                              }}
                            >
                              {categoryLabel}
                            </label>
                          </div>
                          <div className="space-y-1 pl-6">
                            {filteredFields.map((field) => (
                              <div key={field.id} className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedFields.has(field.id)}
                                  onCheckedChange={() => handleFieldToggle(field.id)}
                                />
                                <label className="text-sm cursor-pointer" onClick={() => handleFieldToggle(field.id)}>
                                  {field.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Preview and Export */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <CardTitle>Preview ({total} candidates)</CardTitle>
                <Button onClick={handleExport} disabled={exporting || selectedFields.size === 0 || loading}>
                  {exporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export to Excel
                    </>
                  )}
                </Button>
              </div>
              {/* Page Size Selector */}
              {total > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
                  {!showCustomInput ? (
                    <Select
                      value={(filters.page_size || 100).toString()}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          setShowCustomInput(true);
                        } else {
                          handlePageSizeChange(parseInt(value, 10));
                        }
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-8 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="1000">1000</SelectItem>
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="10000"
                        value={customPageSize}
                        onChange={(e) => setCustomPageSize(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCustomPageSizeSubmit();
                          } else if (e.key === "Escape") {
                            setShowCustomInput(false);
                            setCustomPageSize("");
                          }
                        }}
                        placeholder="Enter size"
                        className="h-8 w-24"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCustomPageSizeSubmit}
                        className="h-8 w-8 p-0"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowCustomInput(false);
                          setCustomPageSize("");
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  No candidates found. Please adjust your filters and search again.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">SN</TableHead>
                          {visibleColumns.slice(0, 15).map((fieldId) => (
                            <TableHead key={fieldId}>{getFieldLabel(fieldId)}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidates.map((candidate, idx) => {
                          const serialNumber = ((currentPage - 1) * (filters.page_size || 100)) + idx + 1;
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{serialNumber}</TableCell>
                              {visibleColumns.slice(0, 15).map((fieldId) => {
                              let value: any = "";
                              switch (fieldId) {
                                case "candidate_name":
                                  value = candidate.candidate_name;
                                  break;
                                case "candidate_index_number":
                                  value = candidate.candidate_index_number;
                                  break;
                                case "school_name":
                                  value = "N/A"; // Not in CandidateScoreEntry
                                  break;
                                case "school_code":
                                  value = "N/A";
                                  break;
                                case "exam_name":
                                  value = candidate.exam_name;
                                  break;
                                case "exam_type":
                                  value = candidate.exam_name;
                                  break;
                                case "exam_year":
                                  value = candidate.exam_year;
                                  break;
                                case "exam_series":
                                  value = candidate.exam_series;
                                  break;
                                case "programme_name":
                                  value = candidate.programme_name || "-";
                                  break;
                                case "programme_code":
                                  value = candidate.programme_code || "-";
                                  break;
                                case "subject_name":
                                  value = candidate.subject_name;
                                  break;
                                case "subject_code":
                                  value = candidate.subject_code;
                                  break;
                                case "subject_series":
                                  value = candidate.subject_series || "-";
                                  break;
                                case "obj_raw_score":
                                  value = candidate.obj_raw_score || "-";
                                  break;
                                case "essay_raw_score":
                                  value = candidate.essay_raw_score || "-";
                                  break;
                                case "pract_raw_score":
                                  value = candidate.pract_raw_score || "-";
                                  break;
                                case "total_score":
                                  value = "N/A"; // Need to calculate or get from API
                                  break;
                                case "grade":
                                  value = "N/A"; // Need to calculate or get from API
                                  break;
                                default:
                                  value = "-";
                              }
                              return <TableCell key={fieldId}>{String(value)}</TableCell>;
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Pagination */}
              {(totalPages > 1 || total > 0) && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * (filters.page_size || 100)) + 1} to{" "}
                    {Math.min(currentPage * (filters.page_size || 100), total)} of {total} candidate{total !== 1 ? "s" : ""}
                    {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                        disabled={currentPage === 1 || loading}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                        disabled={currentPage === totalPages || loading}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
