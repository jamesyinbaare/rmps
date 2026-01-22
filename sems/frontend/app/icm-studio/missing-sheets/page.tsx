"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, AlertCircle, CheckCircle2, Download, X, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, FileText } from "lucide-react";
import { compareSheetIds, getAllExams, getSchoolsForExam, getSubjectsForExamAndSchool } from "@/lib/api";
import type { Exam, SheetIdComparisonResponse, SheetIdInfo, School, Subject } from "@/types/document";
import Link from "next/link";

export default function MissingSheetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const examIdParam = searchParams.get("exam_id");

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(
    examIdParam ? parseInt(examIdParam) : null
  );
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(
    searchParams.get("school_id") ? parseInt(searchParams.get("school_id")!) : null
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    searchParams.get("subject_id") ? parseInt(searchParams.get("subject_id")!) : null
  );
  const [selectedTestType, setSelectedTestType] = useState<number | null>(
    searchParams.get("test_type") ? parseInt(searchParams.get("test_type")!) : null
  );
  const [selectedSubjectType, setSelectedSubjectType] = useState<string | null>(
    searchParams.get("subject_type") || null
  );

  const [comparison, setComparison] = useState<SheetIdComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [missingSheets, setMissingSheets] = useState<SheetIdInfo[]>([]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
        if (!selectedExamId && allExams.length > 0) {
          const newestExam = allExams.reduce((newest, current) => {
            const newestDate = new Date(newest.created_at);
            const currentDate = new Date(current.created_at);
            return currentDate > newestDate ? current : newest;
          });
          setSelectedExamId(newestExam.id);
        }
      } catch (error) {
        console.error("Error loading exams:", error);
      }
    };
    loadExams();
  }, []);

  // Load schools for selected exam
  useEffect(() => {
    const loadSchools = async () => {
      if (!selectedExamId) {
        setSchools([]);
        return;
      }
      try {
        const examSchools = await getSchoolsForExam(selectedExamId);
        setSchools(examSchools);
      } catch (error) {
        console.error("Error loading schools:", error);
        setSchools([]);
      }
    };
    loadSchools();
  }, [selectedExamId]);

  // Load subjects for selected exam and school
  useEffect(() => {
    const loadSubjects = async () => {
      if (!selectedExamId) {
        setSubjects([]);
        return;
      }
      try {
        const examSubjects = await getSubjectsForExamAndSchool(selectedExamId, selectedSchoolId || undefined);
        setSubjects(examSubjects);
      } catch (error) {
        console.error("Error loading subjects:", error);
        setSubjects([]);
      }
    };
    loadSubjects();
  }, [selectedExamId, selectedSchoolId]);

  // Load missing sheets with filters
  useEffect(() => {
    const loadMissingSheets = async () => {
      if (!selectedExamId) {
        setComparison(null);
        setMissingSheets([]);
        return;
      }

      setLoading(true);
      try {
        const result = await compareSheetIds(selectedExamId, {
          school_id: selectedSchoolId || undefined,
          subject_id: selectedSubjectId || undefined,
          test_type: selectedTestType || undefined,
        });
        setComparison(result);

        // Filter missing sheets by subject_type if selected
        let filtered = result.missing_sheet_ids_info;
        if (selectedSubjectType) {
          filtered = filtered.filter((sheet) => {
            const subject = subjects.find((s) => s.id === sheet.subject_id);
            return subject?.subject_type === selectedSubjectType;
          });
        }
        setMissingSheets(filtered);
      } catch (error) {
        console.error("Error loading missing sheets:", error);
        setComparison(null);
        setMissingSheets([]);
      } finally {
        setLoading(false);
      }
    };

    loadMissingSheets();
  }, [selectedExamId, selectedSchoolId, selectedSubjectId, selectedTestType, selectedSubjectType, subjects]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", selectedExamId.toString());
    if (selectedSchoolId) params.set("school_id", selectedSchoolId.toString());
    if (selectedSubjectId) params.set("subject_id", selectedSubjectId.toString());
    if (selectedTestType) params.set("test_type", selectedTestType.toString());
    if (selectedSubjectType) params.set("subject_type", selectedSubjectType);

    router.replace(`/icm-studio/missing-sheets?${params.toString()}`, { scroll: false });
  }, [selectedExamId, selectedSchoolId, selectedSubjectId, selectedTestType, selectedSubjectType, router]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const formatExamLabel = (exam: Exam) => {
    return `${exam.exam_type} - ${exam.series} ${exam.year}`;
  };

  const getTestTypeLabel = (testType: number | null) => {
    if (testType === 1) return "Objectives";
    if (testType === 2) return "Essay";
    if (testType === 3) return "Practicals";
    return "Unknown";
  };

  const clearFilters = () => {
    setSelectedSchoolId(null);
    setSelectedSubjectId(null);
    setSelectedTestType(null);
    setSelectedSubjectType(null);
    setSearchQuery("");
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!comparison || !missingSheets.length) {
      return null;
    }

    const completionRate = comparison.total_expected_sheets > 0
      ? ((comparison.total_uploaded_sheets / comparison.total_expected_sheets) * 100).toFixed(1)
      : "0";

    // Missing by test type
    const missingByTestType = {
      1: missingSheets.filter(s => s.test_type === 1).length,
      2: missingSheets.filter(s => s.test_type === 2).length,
      3: missingSheets.filter(s => s.test_type === 3).length,
    };

    // Missing by subject type
    const coreSubjects = subjects.filter(s => s.subject_type === "CORE").map(s => s.id);
    const electiveSubjects = subjects.filter(s => s.subject_type === "ELECTIVE").map(s => s.id);
    const missingCore = missingSheets.filter(s => s.subject_id && coreSubjects.includes(s.subject_id)).length;
    const missingElective = missingSheets.filter(s => s.subject_id && electiveSubjects.includes(s.subject_id)).length;

    // Unique counts
    const uniqueSchools = new Set(missingSheets.map(s => s.school_id).filter(Boolean)).size;
    const uniqueSubjects = new Set(missingSheets.map(s => s.subject_id).filter(Boolean)).size;

    return {
      totalMissing: missingSheets.length,
      completionRate,
      missingByTestType,
      missingCore,
      missingElective,
      uniqueSchools,
      uniqueSubjects,
    };
  }, [comparison, missingSheets, subjects]);

  // Filter and sort missing sheets
  const filteredAndSortedSheets = useMemo(() => {
    let filtered = [...missingSheets];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(sheet =>
        sheet.sheet_id.toLowerCase().includes(query) ||
        sheet.school_name?.toLowerCase().includes(query) ||
        sheet.school_code?.toLowerCase().includes(query) ||
        sheet.subject_name?.toLowerCase().includes(query) ||
        sheet.subject_code?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case "sheet_id":
            aValue = a.sheet_id;
            bValue = b.sheet_id;
            break;
          case "school":
            aValue = (a.school_name || "").toLowerCase();
            bValue = (b.school_name || "").toLowerCase();
            break;
          case "subject":
            aValue = (a.subject_name || "").toLowerCase();
            bValue = (b.subject_name || "").toLowerCase();
            break;
          case "candidates":
            aValue = a.candidate_count ?? 0;
            bValue = b.candidate_count ?? 0;
            break;
          case "test_type":
            aValue = a.test_type ?? 0;
            bValue = b.test_type ?? 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [missingSheets, searchQuery, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  // Export functions
  const exportToCSV = () => {
    if (filteredAndSortedSheets.length === 0) return;

    const headers = ["Sheet ID", "Test Type", "School Name", "School Code", "Subject Name", "Subject Code", "Series", "Sheet #", "Candidates"];
    const rows = filteredAndSortedSheets.map(sheet => [
      sheet.sheet_id,
      getTestTypeLabel(sheet.test_type),
      sheet.school_name || "",
      sheet.school_code || "",
      sheet.subject_name || "",
      sheet.subject_code || "",
      sheet.series?.toString() || "",
      sheet.sheet_number?.toString() || "",
      sheet.candidate_count?.toString() || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);

    const selectedExam = exams.find(e => e.id === selectedExamId);
    const examLabel = selectedExam ? `${selectedExam.exam_type}_${selectedExam.series}_${selectedExam.year}` : "missing_sheets";
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `missing_sheets_${examLabel}_${dateStr}.csv`);

    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = async () => {
    if (filteredAndSortedSheets.length === 0) return;

    try {
      // Try dynamic import of XLSX library
      const XLSX = await import("xlsx").catch(() => null);

      if (!XLSX) {
        // Fallback to CSV if XLSX library is not available
        console.warn("XLSX library not available, falling back to CSV export");
        exportToCSV();
        return;
      }

      const headers = ["Sheet ID", "Test Type", "School Name", "School Code", "Subject Name", "Subject Code", "Series", "Sheet #", "Candidates"];
      const rows = filteredAndSortedSheets.map(sheet => [
        sheet.sheet_id,
        getTestTypeLabel(sheet.test_type),
        sheet.school_name || "",
        sheet.school_code || "",
        sheet.subject_name || "",
        sheet.subject_code || "",
        sheet.series?.toString() || "",
        sheet.sheet_number?.toString() || "",
        sheet.candidate_count?.toString() || "",
      ]);

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Missing Sheets");

      const selectedExam = exams.find(e => e.id === selectedExamId);
      const examLabel = selectedExam ? `${selectedExam.exam_type}_${selectedExam.series}_${selectedExam.year}` : "missing_sheets";
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `missing_sheets_${examLabel}_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      // Fallback to CSV if Excel export fails
      exportToCSV();
    }
  };

  // Active filters for chips
  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (selectedSchoolId) {
      const school = schools.find(s => s.id === selectedSchoolId);
      if (school) {
        filters.push({
          key: "school",
          label: `School: ${school.name}`,
          onRemove: () => setSelectedSchoolId(null),
        });
      }
    }

    if (selectedSubjectId) {
      const subject = subjects.find(s => s.id === selectedSubjectId);
      if (subject) {
        filters.push({
          key: "subject",
          label: `Subject: ${subject.name}`,
          onRemove: () => setSelectedSubjectId(null),
        });
      }
    }

    if (selectedTestType) {
      filters.push({
        key: "test_type",
        label: `Test Type: ${getTestTypeLabel(selectedTestType)}`,
        onRemove: () => setSelectedTestType(null),
      });
    }

    if (selectedSubjectType) {
      filters.push({
        key: "subject_type",
        label: `Subject Type: ${selectedSubjectType}`,
        onRemove: () => setSelectedSubjectType(null),
      });
    }

    if (searchQuery.trim()) {
      filters.push({
        key: "search",
        label: `Search: "${searchQuery}"`,
        onRemove: () => setSearchQuery(""),
      });
    }

    return filters;
  }, [selectedSchoolId, selectedSubjectId, selectedTestType, selectedSubjectType, searchQuery, schools, subjects]);

  return (
    <DashboardLayout title="Missing Sheets">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Missing Sheets" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/icm-studio">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Missing Sheets</h1>
                  <p className="text-muted-foreground">
                    Sheets that were expected but have not been uploaded yet
                    {selectedExamId && (
                      <>
                        {" • "}
                        <span className="font-medium text-foreground">
                          {selectedExam && formatExamLabel(selectedExam)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              {selectedExamId && (
                <Link href={`/icm-studio/sheet-tracking?exam_id=${selectedExamId}`}>
                  <Button variant="outline" size="sm">
                    View Full Tracking
                  </Button>
                </Link>
              )}
            </div>

            {/* Summary Statistics */}
            {selectedExamId && summaryStats && !loading && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Missing</CardTitle>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.totalMissing.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      out of {comparison?.total_expected_sheets.toLocaleString() || 0} expected
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.completionRate}%</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {comparison?.total_uploaded_sheets.toLocaleString() || 0} uploaded
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Objectives</CardTitle>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {summaryStats.missingByTestType[1] || 0}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.missingByTestType[1] || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">missing</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Essay</CardTitle>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      {summaryStats.missingByTestType[2] || 0}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.missingByTestType[2] || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">missing</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Affected Schools</CardTitle>
                    <Badge variant="outline">{summaryStats.uniqueSchools}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.uniqueSchools}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summaryStats.missingCore + summaryStats.missingElective > 0 ? (
                        `${summaryStats.missingCore} Core, ${summaryStats.missingElective} Elective`
                      ) : (
                        "schools"
                      )}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Affected Subjects</CardTitle>
                    <Badge variant="outline">{summaryStats.uniqueSubjects}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryStats.uniqueSubjects}</div>
                    <p className="text-xs text-muted-foreground mt-1">unique subjects</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Filters</CardTitle>
                    <CardDescription>Filter missing sheets by exam, school, subject, test type, and subject type</CardDescription>
                  </div>
                  {filteredAndSortedSheets.length > 0 && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportToCSV}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportToExcel}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export Excel
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Active Filter Chips */}
                {activeFilters.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {activeFilters.map((filter) => (
                      <Badge key={filter.key} variant="secondary" className="gap-1 py-1">
                        {filter.label}
                        <button
                          onClick={filter.onRemove}
                          className="ml-1 rounded-full hover:bg-background"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-6 text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Examination</label>
                    <Select
                      value={selectedExamId?.toString() || ""}
                      onValueChange={(value) => setSelectedExamId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select examination" />
                      </SelectTrigger>
                      <SelectContent>
                        {exams.map((exam) => (
                          <SelectItem key={exam.id} value={exam.id.toString()}>
                            {formatExamLabel(exam)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">School</label>
                    <Select
                      value={selectedSchoolId?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSchoolId(null);
                        } else {
                          setSelectedSchoolId(parseInt(value));
                        }
                        setSelectedSubjectId(null); // Reset subject when school changes
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All schools" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All schools</SelectItem>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id.toString()}>
                            {school.name} ({school.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject</label>
                    <Select
                      value={selectedSubjectId?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSubjectId(null);
                        } else {
                          setSelectedSubjectId(parseInt(value));
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All subjects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All subjects</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id.toString()}>
                            {subject.name} ({subject.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject Type</label>
                    <Select
                      value={selectedSubjectType || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSubjectType(null);
                        } else {
                          setSelectedSubjectType(value);
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="CORE">Core</SelectItem>
                        <SelectItem value="ELECTIVE">Elective</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Test Type</label>
                    <Select
                      value={selectedTestType?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedTestType(null);
                        } else {
                          setSelectedTestType(parseInt(value));
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="1">Objectives</SelectItem>
                        <SelectItem value="2">Essay</SelectItem>
                        <SelectItem value="3">Practicals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 flex items-end">
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="w-full"
                      disabled={activeFilters.length === 0}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="mt-4">
                  <label className="text-sm font-medium mb-2 block">Search</label>
                  <input
                    type="text"
                    placeholder="Search by sheet ID, school, or subject..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {!selectedExamId ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Please select an examination to view missing sheets</p>
                </CardContent>
              </Card>
            ) : loading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading missing sheets...</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Missing Sheets</CardTitle>
                      <CardDescription>
                        {filteredAndSortedSheets.length === missingSheets.length
                          ? `${missingSheets.length} missing sheet${missingSheets.length !== 1 ? "s" : ""} found`
                          : `Showing ${filteredAndSortedSheets.length} of ${missingSheets.length} missing sheets`
                        }
                        {comparison && ` (out of ${comparison.total_expected_sheets} expected)`}
                      </CardDescription>
                    </div>
                    {filteredAndSortedSheets.length > 0 && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportToCSV}>
                          <FileText className="h-4 w-4 mr-2" />
                          CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportToExcel}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Excel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {missingSheets.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600 opacity-50" />
                      <p className="text-lg font-medium mb-2">All sheets uploaded!</p>
                      <p className="text-muted-foreground">
                        No missing sheets found for {selectedExam && formatExamLabel(selectedExam)}.
                      </p>
                    </div>
                  ) : filteredAndSortedSheets.length === 0 ? (
                    <div className="py-12 text-center">
                      <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-600 opacity-50" />
                      <p className="text-lg font-medium mb-2">No results found</p>
                      <p className="text-muted-foreground mb-4">
                        No missing sheets match your current filters or search query.
                      </p>
                      {(activeFilters.length > 0 || searchQuery.trim()) && (
                        <Button variant="outline" onClick={clearFilters}>
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <button
                                onClick={() => handleSort("sheet_id")}
                                className="flex items-center hover:text-foreground"
                              >
                                Sheet ID
                                {getSortIcon("sheet_id")}
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                onClick={() => handleSort("test_type")}
                                className="flex items-center hover:text-foreground"
                              >
                                Test Type
                                {getSortIcon("test_type")}
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                onClick={() => handleSort("school")}
                                className="flex items-center hover:text-foreground"
                              >
                                School
                                {getSortIcon("school")}
                              </button>
                            </TableHead>
                            <TableHead>
                              <button
                                onClick={() => handleSort("subject")}
                                className="flex items-center hover:text-foreground"
                              >
                                Subject
                                {getSortIcon("subject")}
                              </button>
                            </TableHead>
                            <TableHead>Series</TableHead>
                            <TableHead>Sheet #</TableHead>
                            <TableHead>
                              <button
                                onClick={() => handleSort("candidates")}
                                className="flex items-center hover:text-foreground"
                              >
                                Candidates
                                {getSortIcon("candidates")}
                              </button>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAndSortedSheets.map((sheet) => {
                            const subject = subjects.find(s => s.id === sheet.subject_id);
                            return (
                              <TableRow key={sheet.sheet_id}>
                                <TableCell className="font-mono text-sm">{sheet.sheet_id}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      sheet.test_type === 1
                                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                                        : sheet.test_type === 2
                                        ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300"
                                        : sheet.test_type === 3
                                        ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300"
                                        : ""
                                    }
                                  >
                                    {getTestTypeLabel(sheet.test_type)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{sheet.school_name || "—"}</div>
                                  {sheet.school_code && (
                                    <div className="text-xs text-muted-foreground">{sheet.school_code}</div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className="font-medium">{sheet.subject_name || "—"}</div>
                                      {sheet.subject_code && (
                                        <div className="text-xs text-muted-foreground">{sheet.subject_code}</div>
                                      )}
                                    </div>
                                    {subject?.subject_type && (
                                      <Badge variant="outline" className="text-xs">
                                        {subject.subject_type}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{sheet.series || "—"}</TableCell>
                                <TableCell>{sheet.sheet_number || "—"}</TableCell>
                                <TableCell>{sheet.candidate_count?.toLocaleString() || "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
