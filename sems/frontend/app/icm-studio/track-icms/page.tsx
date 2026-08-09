"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import {
  TrackICMSDataTable,
  type TrackICMSTab,
} from "@/components/TrackICMSDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  compareSheetIds,
  getAllExams,
  getSchoolsForExamWithCandidates,
  getSubjectsForExamAndSchoolByCandidates,
} from "@/lib/api";
import type { Exam, School, SheetIdComparisonResponse, SheetIdInfo, Subject } from "@/types/document";

type SubjectOption = {
  id: number;
  code: string;
  name: string;
  subject_type?: string | null;
};

function getTestTypeLabel(testType: number | null) {
  if (testType === 1) return "Objectives";
  if (testType === 2) return "Essay";
  if (testType === 3) return "Practicals";
  return "Unknown";
}

function formatExamLabel(exam: Exam) {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${exam.year} ${exam.series} ${typeLabel}`;
}

export default function TrackICMSPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(
    searchParams.get("exam_id") ? parseInt(searchParams.get("exam_id")!, 10) : null
  );
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(
    searchParams.get("school_id") ? parseInt(searchParams.get("school_id")!, 10) : null
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    searchParams.get("subject_id") ? parseInt(searchParams.get("subject_id")!, 10) : null
  );
  const [selectedTestType, setSelectedTestType] = useState<number | null>(
    searchParams.get("test_type") ? parseInt(searchParams.get("test_type")!, 10) : null
  );
  const [selectedSubjectType, setSelectedSubjectType] = useState<string | null>(
    searchParams.get("subject_type") || null
  );
  const [activeTab, setActiveTab] = useState<TrackICMSTab>(
    (searchParams.get("tab") as TrackICMSTab) || "missing"
  );

  const [comparison, setComparison] = useState<SheetIdComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => ({
          value: exam.id,
          label: formatExamLabel(exam),
        })),
    [exams]
  );

  const schoolOptions = useMemo(
    () =>
      schools.map((school) => ({
        value: school.id,
        label: `${school.code} - ${school.name}`,
      })),
    [schools]
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((subject) => ({
        value: subject.id,
        label: `${subject.code} - ${subject.name}`,
      })),
    [subjects]
  );

  // Load exams once
  useEffect(() => {
    let cancelled = false;
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        if (cancelled) return;
        setExams(allExams);
        if (selectedExamId && !allExams.some((e) => e.id === selectedExamId)) {
          setError(`Exam with id ${selectedExamId} not found.`);
          setSelectedExamId(null);
        }
      } catch (err) {
        console.error("Error loading exams:", err);
        if (!cancelled) setError("Failed to load examinations.");
      }
    };
    void loadExams();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load schools for exam (candidate-based, not document-scan)
  useEffect(() => {
    let cancelled = false;
    const loadSchools = async () => {
      if (!selectedExamId) {
        setSchools([]);
        return;
      }
      setLoadingFilters(true);
      try {
        const examSchools = await getSchoolsForExamWithCandidates(selectedExamId);
        if (!cancelled) setSchools(examSchools);
      } catch (err) {
        console.error("Error loading schools:", err);
        if (!cancelled) setSchools([]);
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    };
    void loadSchools();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  // Load subjects when school selected; otherwise derive from compare payload
  useEffect(() => {
    let cancelled = false;
    const loadSubjects = async () => {
      if (!selectedExamId || !selectedSchoolId) {
        return;
      }
      setLoadingFilters(true);
      try {
        const schoolSubjects = await getSubjectsForExamAndSchoolByCandidates(
          selectedExamId,
          selectedSchoolId
        );
        if (!cancelled) {
          setSubjects(
            schoolSubjects.map((s: Subject) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              subject_type: s.subject_type,
            }))
          );
        }
      } catch (err) {
        console.error("Error loading subjects:", err);
        if (!cancelled) setSubjects([]);
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    };
    void loadSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId, selectedSchoolId]);

  // Compare sheets — do not depend on subjects/exams (avoids double fetch)
  useEffect(() => {
    let cancelled = false;
    const loadComparison = async () => {
      if (!selectedExamId) {
        setComparison(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await compareSheetIds(selectedExamId, {
          school_id: selectedSchoolId || undefined,
          subject_id: selectedSubjectId || undefined,
          test_type: selectedTestType || undefined,
        });
        if (cancelled) return;
        setComparison(result);

        // When no school filter, derive subject options from compare payload
        if (!selectedSchoolId) {
          const byId = new Map<number, SubjectOption>();
          for (const sheet of result.expected_sheet_ids_info) {
            if (sheet.subject_id == null || byId.has(sheet.subject_id)) continue;
            byId.set(sheet.subject_id, {
              id: sheet.subject_id,
              code: sheet.subject_code || String(sheet.subject_id),
              name: sheet.subject_name || "Unknown",
              subject_type: sheet.subject_type,
            });
          }
          setSubjects(Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code)));
        }
      } catch (err) {
        console.error("Error loading sheet comparison:", err);
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load sheet comparison.";
        setError(message);
        if (message.includes("not found")) {
          setSelectedExamId(null);
          setComparison(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadComparison();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId, selectedSchoolId, selectedSubjectId, selectedTestType]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", selectedExamId.toString());
    if (selectedSchoolId) params.set("school_id", selectedSchoolId.toString());
    if (selectedSubjectId) params.set("subject_id", selectedSubjectId.toString());
    if (selectedTestType) params.set("test_type", selectedTestType.toString());
    if (selectedSubjectType) params.set("subject_type", selectedSubjectType);
    if (activeTab !== "missing") params.set("tab", activeTab);
    const qs = params.toString();
    router.replace(`/icm-studio/track-icms${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [
    selectedExamId,
    selectedSchoolId,
    selectedSubjectId,
    selectedTestType,
    selectedSubjectType,
    activeTab,
    router,
  ]);

  const filterSheets = useCallback(
    (sheets: SheetIdInfo[]) => {
      if (!selectedSubjectType) return sheets;
      return sheets.filter((sheet) => sheet.subject_type === selectedSubjectType);
    },
    [selectedSubjectType]
  );

  const tabSheets = useMemo(() => {
    if (!comparison) {
      return { missing: [], uploaded: [], expected: [], extra: [] };
    }
    return {
      missing: filterSheets(comparison.missing_sheet_ids_info),
      uploaded: filterSheets(comparison.uploaded_sheet_ids_info),
      expected: filterSheets(comparison.expected_sheet_ids_info),
      extra: filterSheets(comparison.extra_sheet_ids_info),
    };
  }, [comparison, filterSheets]);

  const summaryStats = useMemo(() => {
    if (!comparison) return null;
    const missing = tabSheets.missing;
    const expected = comparison.total_expected_sheets;
    const uploaded = comparison.total_uploaded_sheets;
    const completionRate =
      expected > 0 ? ((uploaded / expected) * 100).toFixed(1) : "0";
    return {
      expected,
      uploaded,
      missing: missing.length,
      extra: tabSheets.extra.length,
      completionRate,
      missingObj: missing.filter((s) => s.test_type === 1).length,
      missingEssay: missing.filter((s) => s.test_type === 2).length,
      missingPract: missing.filter((s) => s.test_type === 3).length,
      missingCore: missing.filter((s) => s.subject_type === "CORE").length,
      missingElective: missing.filter((s) => s.subject_type === "ELECTIVE").length,
    };
  }, [comparison, tabSheets]);

  const clearSecondaryFilters = () => {
    setSelectedSchoolId(null);
    setSelectedSubjectId(null);
    setSelectedTestType(null);
    setSelectedSubjectType(null);
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(null);
    } else {
      setSelectedExamId(typeof value === "number" ? value : parseInt(String(value), 10));
    }
    clearSecondaryFilters();
    setSubjects([]);
    setComparison(null);
  };

  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (selectedSchoolId) {
      const school = schools.find((s) => s.id === selectedSchoolId);
      filters.push({
        key: "school",
        label: `School: ${school ? school.name : selectedSchoolId}`,
        onRemove: () => {
          setSelectedSchoolId(null);
          setSelectedSubjectId(null);
        },
      });
    }
    if (selectedSubjectId) {
      const subject = subjects.find((s) => s.id === selectedSubjectId);
      filters.push({
        key: "subject",
        label: `Subject: ${subject ? subject.name : selectedSubjectId}`,
        onRemove: () => setSelectedSubjectId(null),
      });
    }
    if (selectedTestType) {
      filters.push({
        key: "test_type",
        label: `Test: ${getTestTypeLabel(selectedTestType)}`,
        onRemove: () => setSelectedTestType(null),
      });
    }
    if (selectedSubjectType) {
      filters.push({
        key: "subject_type",
        label: `Type: ${selectedSubjectType}`,
        onRemove: () => setSelectedSubjectType(null),
      });
    }
    return filters;
  }, [
    selectedSchoolId,
    selectedSubjectId,
    selectedTestType,
    selectedSubjectType,
    schools,
    subjects,
  ]);

  const exportRows = tabSheets.missing;

  const exportToCSV = () => {
    if (exportRows.length === 0) return;
    const headers = [
      "Sheet ID",
      "Test Type",
      "School Name",
      "School Code",
      "Subject Name",
      "Subject Code",
      "Subject Type",
      "Series",
      "Sheet #",
      "Candidates",
    ];
    const rows = exportRows.map((sheet) => [
      sheet.sheet_id,
      getTestTypeLabel(sheet.test_type),
      sheet.school_name || "",
      sheet.school_code || "",
      sheet.subject_name || "",
      sheet.subject_code || "",
      sheet.subject_type || "",
      sheet.series?.toString() || "",
      sheet.sheet_number?.toString() || "",
      sheet.candidate_count?.toString() || "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const selectedExam = exams.find((e) => e.id === selectedExamId);
    const examLabel = selectedExam
      ? `${selectedExam.exam_type}_${selectedExam.series}_${selectedExam.year}`
      : "track_icms";
    link.setAttribute("download", `track_icms_${examLabel}_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = async () => {
    if (exportRows.length === 0) return;
    try {
      const XLSX = await import("xlsx").catch(() => null);
      if (!XLSX) {
        exportToCSV();
        return;
      }
      const headers = [
        "Sheet ID",
        "Test Type",
        "School Name",
        "School Code",
        "Subject Name",
        "Subject Code",
        "Subject Type",
        "Series",
        "Sheet #",
        "Candidates",
      ];
      const rows = exportRows.map((sheet) => [
        sheet.sheet_id,
        getTestTypeLabel(sheet.test_type),
        sheet.school_name || "",
        sheet.school_code || "",
        sheet.subject_name || "",
        sheet.subject_code || "",
        sheet.subject_type || "",
        sheet.series?.toString() || "",
        sheet.sheet_number?.toString() || "",
        sheet.candidate_count?.toString() || "",
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Track ICMS");
      const selectedExam = exams.find((e) => e.id === selectedExamId);
      const examLabel = selectedExam
        ? `${selectedExam.exam_type}_${selectedExam.series}_${selectedExam.year}`
        : "track_icms";
      XLSX.writeFile(
        workbook,
        `track_icms_${examLabel}_${new Date().toISOString().split("T")[0]}.xlsx`
      );
    } catch (err) {
      console.error("Error exporting to Excel:", err);
      exportToCSV();
    }
  };

  const currentSheets = tabSheets[activeTab];

  return (
    <DashboardLayout title="Track ICMS">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar title="Track ICMS" showSearch={false} />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/icm-studio">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground">
                Compare expected score sheets with uploads for an examination.
              </p>
            </div>
          </div>

          <Card className="shrink-0">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[240px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
                    Examination
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={examOptions}
                      value={selectedExamId ?? ""}
                      onValueChange={handleExamChange}
                      placeholder="Select an examination"
                      searchPlaceholder="Search examinations..."
                      emptyMessage="No examinations found"
                    />
                  </div>
                </div>

                <div className="relative min-w-[220px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
                    School
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={schoolOptions}
                      value={selectedSchoolId ?? "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setSelectedSchoolId(null);
                          setSelectedSubjectId(null);
                        } else {
                          setSelectedSchoolId(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
                          setSelectedSubjectId(null);
                        }
                      }}
                      placeholder="All schools"
                      disabled={!selectedExamId || loadingFilters}
                      allowAll
                      allLabel="All schools"
                      searchPlaceholder="Search schools..."
                      emptyMessage="No schools found"
                    />
                  </div>
                </div>

                <div className="relative min-w-[220px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
                    Subject
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={subjectOptions}
                      value={selectedSubjectId ?? "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setSelectedSubjectId(null);
                        } else {
                          setSelectedSubjectId(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
                        }
                      }}
                      placeholder="All subjects"
                      disabled={!selectedExamId || loadingFilters}
                      allowAll
                      allLabel="All subjects"
                      searchPlaceholder="Search subjects..."
                      emptyMessage="No subjects found"
                    />
                  </div>
                </div>

                <Select
                  value={selectedTestType?.toString() ?? "all"}
                  onValueChange={(value) =>
                    setSelectedTestType(value === "all" ? null : parseInt(value, 10))
                  }
                  disabled={!selectedExamId}
                >
                  <SelectTrigger className="h-11 w-[140px]">
                    <SelectValue placeholder="Test type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tests</SelectItem>
                    <SelectItem value="1">Objectives</SelectItem>
                    <SelectItem value="2">Essay</SelectItem>
                    <SelectItem value="3">Practicals</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedSubjectType ?? "all"}
                  onValueChange={(value) =>
                    setSelectedSubjectType(value === "all" ? null : value)
                  }
                  disabled={!selectedExamId}
                >
                  <SelectTrigger className="h-11 w-[140px]">
                    <SelectValue placeholder="Subject type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="CORE">Core</SelectItem>
                    <SelectItem value="ELECTIVE">Elective</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {activeFilters.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {activeFilters.map((filter) => (
                    <Badge key={filter.key} variant="secondary" className="gap-1 pr-1">
                      {filter.label}
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-muted"
                        onClick={filter.onRemove}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button variant="ghost" size="sm" className="h-7" onClick={clearSecondaryFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {summaryStats && selectedExamId ? (
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <StatChip label="Expected" value={summaryStats.expected} />
              <StatChip label="Uploaded" value={summaryStats.uploaded} />
              <StatChip label="Missing" value={summaryStats.missing} emphasize />
              <StatChip label="Extra" value={summaryStats.extra} />
              <StatChip label="Complete" value={`${summaryStats.completionRate}%`} />
              <StatChip
                label="Missing split"
                value={`${summaryStats.missingObj}/${summaryStats.missingEssay}/${summaryStats.missingPract}`}
                hint="Obj / Essay / Pract"
              />
            </div>
          ) : null}

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!selectedExamId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                <p className="font-medium text-foreground">Select an examination</p>
                <p className="max-w-sm text-sm">
                  Choose an examination to compare expected score sheets with uploads.
                </p>
              </div>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as TrackICMSTab)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="shrink-0 border-b px-4 pt-3">
                  <TabsList>
                    <TabsTrigger value="missing">Missing ({tabSheets.missing.length})</TabsTrigger>
                    <TabsTrigger value="uploaded">
                      Uploaded ({tabSheets.uploaded.length})
                    </TabsTrigger>
                    <TabsTrigger value="expected">
                      Expected ({tabSheets.expected.length})
                    </TabsTrigger>
                    <TabsTrigger value="extra">Extra ({tabSheets.extra.length})</TabsTrigger>
                  </TabsList>
                </div>
                {(["missing", "uploaded", "expected", "extra"] as TrackICMSTab[]).map((tab) => (
                  <TabsContent
                    key={tab}
                    value={tab}
                    className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                    forceMount
                  >
                    {activeTab === tab ? (
                      <TrackICMSDataTable
                        sheets={currentSheets}
                        tab={tab}
                        loading={loading}
                        error={error}
                        showExport={tab === "missing"}
                        onExportCsv={exportToCSV}
                        onExportExcel={exportToExcel}
                      />
                    ) : null}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatChip({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        emphasize ? "border-amber-300/60 bg-amber-50/60" : "bg-muted/30"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
