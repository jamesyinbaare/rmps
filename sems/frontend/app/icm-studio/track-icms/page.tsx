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
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
    const expected = tabSheets.expected.length;
    const uploaded = tabSheets.uploaded.length;
    const missing = tabSheets.missing;
    const extra = tabSheets.extra.length;
    const completionRate =
      expected > 0 ? ((uploaded / expected) * 100).toFixed(1) : "0";
    return {
      expected,
      uploaded,
      missing: missing.length,
      extra,
      completionRate,
      missingObj: missing.filter((s) => s.test_type === 1).length,
      missingEssay: missing.filter((s) => s.test_type === 2).length,
      missingPract: missing.filter((s) => s.test_type === 3).length,
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href="/icm-studio">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Compare expected sheets with uploads
            </p>
          </div>

          <div className="shrink-0 space-y-2 rounded-lg border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect
                className="min-w-[200px] flex-1 basis-[200px]"
                triggerClassName="h-9"
                options={examOptions}
                value={selectedExamId ?? ""}
                onValueChange={handleExamChange}
                placeholder="Examination"
                searchPlaceholder="Search examinations..."
                emptyMessage="No examinations found"
              />
              <SearchableSelect
                className="min-w-[180px] flex-1 basis-[180px]"
                triggerClassName="h-9"
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
              <SearchableSelect
                className="min-w-[180px] flex-1 basis-[180px]"
                triggerClassName="h-9"
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
              <Select
                value={selectedTestType?.toString() ?? "all"}
                onValueChange={(value) =>
                  setSelectedTestType(value === "all" ? null : parseInt(value, 10))
                }
                disabled={!selectedExamId}
              >
                <SelectTrigger className="h-9 w-[130px]">
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
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="CORE">Core</SelectItem>
                  <SelectItem value="ELECTIVE">Elective</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(activeFilters.length > 0 || (summaryStats && selectedExamId)) && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {activeFilters.map((filter) => (
                    <Badge key={filter.key} variant="secondary" className="h-6 gap-1 px-2 text-[11px] pr-1">
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
                  {activeFilters.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={clearSecondaryFilters}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>

                {summaryStats && selectedExamId ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <StatInline label="Expected" value={summaryStats.expected} />
                    <StatInline label="Uploaded" value={summaryStats.uploaded} />
                    <StatInline label="Missing" value={summaryStats.missing} emphasize />
                    <StatInline label="Extra" value={summaryStats.extra} />
                    <StatInline label="Complete" value={`${summaryStats.completionRate}%`} />
                    <StatInline
                      label="Obj/Essay/Pract"
                      value={`${summaryStats.missingObj}/${summaryStats.missingEssay}/${summaryStats.missingPract}`}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!selectedExamId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
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
                <div className="shrink-0 border-b px-3 pt-2">
                  <TabsList className="h-9">
                    <TabsTrigger value="missing" className="text-xs sm:text-sm">
                      Missing ({tabSheets.missing.length})
                    </TabsTrigger>
                    <TabsTrigger value="uploaded" className="text-xs sm:text-sm">
                      Uploaded ({tabSheets.uploaded.length})
                    </TabsTrigger>
                    <TabsTrigger value="expected" className="text-xs sm:text-sm">
                      Expected ({tabSheets.expected.length})
                    </TabsTrigger>
                    <TabsTrigger value="extra" className="text-xs sm:text-sm">
                      Extra ({tabSheets.extra.length})
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent
                  value={activeTab}
                  className="mt-0 flex min-h-0 flex-1 flex-col"
                >
                  <TrackICMSDataTable
                    sheets={currentSheets}
                    tab={activeTab}
                    loading={loading}
                    error={error}
                    showExport={activeTab === "missing"}
                    onExportCsv={exportToCSV}
                    onExportExcel={exportToExcel}
                  />
                </TabsContent>
              </Tabs>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatInline({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums tracking-tight",
          emphasize && "text-amber-700 dark:text-amber-400"
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </span>
  );
}
