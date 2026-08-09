"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ApplyScoresDataTable, type AppliedView } from "@/components/ApplyScoresDataTable";
import { DocumentViewer } from "@/components/DocumentViewer";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  bulkUpdateScoresFromReducto,
  downloadDocument,
  getAllExams,
  getFilteredDocuments,
  listSchools,
  listSubjects,
  updateScoresFromReducto,
} from "@/lib/api";
import type {
  Document,
  Exam,
  ExamSeries,
  ExamType,
  School,
  ScoreDocumentFilters,
  Subject,
} from "@/types/document";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ApplyScoresPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 50,
    extraction_status: "success",
    scores_applied: false,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>();

  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [updatingScores, setUpdatingScores] = useState<number | null>(null);

  const view: AppliedView = filters.scores_applied === true ? "applied" : "ready";

  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const [examsData, schoolsData, subjectsData] = await Promise.all([
          getAllExams(),
          listSchools(1, 100),
          listSubjects(1, 100),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        setSubjects(subjectsData);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFilteredDocuments(filters);
      setDocuments(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters };

    if (selectedExamId && exams.length > 0) {
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        newFilters.exam_id = exam.id;
        newFilters.exam_type = exam.exam_type as ExamType;
        newFilters.series = exam.series as ExamSeries;
        newFilters.year = exam.year;
      }
    } else {
      delete newFilters.exam_id;
      delete newFilters.exam_type;
      delete newFilters.series;
      delete newFilters.year;
    }

    newFilters.page = 1;
    setFilters(newFilters);
    setSelectedDocuments(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId, exams]);

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: number | string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (value === undefined) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setSelectedDocuments(new Set());
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(undefined);
    } else {
      setSelectedExamId(typeof value === "number" ? value : parseInt(String(value), 10));
    }
  };

  const examOptions = exams
    .slice()
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      return (a.exam_type || "").localeCompare(b.exam_type || "");
    })
    .map((exam) => {
      const typeLabel =
        exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
      return {
        value: exam.id,
        label: `${exam.year} ${exam.series} ${typeLabel}`,
      };
    });

  const handleViewChange = (nextView: AppliedView) => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      extraction_status: "success",
      scores_applied: nextView === "applied",
    }));
    setSelectedDocuments(new Set());
  };

  const handleSelectDocument = (documentId: number) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d) => d.id)));
    }
  };

  const selectedDocs = documents.filter((d) => selectedDocuments.has(d.id));
  const alreadyAppliedInSelection = selectedDocs.filter((d) => d.scores_applied_at).length;

  const runBulkApply = async () => {
    const ids = Array.from(selectedDocuments);
    if (ids.length === 0) return;

    setApplying(true);
    setApplyProgress({ done: 0, total: ids.length });
    setError(null);
    try {
      const result = await bulkUpdateScoresFromReducto(ids, verifyEnabled, (done, totalCount) => {
        setApplyProgress({ done, total: totalCount });
      });

      const parts = [
        `${result.updated_count} score(s) updated`,
        `${result.documents_succeeded}/${result.documents_processed} document(s)`,
      ];
      if (result.skipped_count > 0) {
        parts.push(`${result.skipped_count} skipped (verify mismatch)`);
        const details = result.skipped_records
          .slice(0, 3)
          .map(
            (r) =>
              `${r.index_number ?? "?"}: ${r.score ?? "—"} ≠ ${r.verify ?? "—"}`
          );
        if (details.length > 0) {
          const more =
            result.skipped_records.length > details.length
              ? ` (+${result.skipped_records.length - details.length} more)`
              : "";
          parts.push(details.join(", ") + more);
        }
      }
      if (result.unmatched_count > 0) {
        parts.push(`${result.unmatched_count} unmatched`);
      }
      if (result.documents_failed > 0) {
        parts.push(`${result.documents_failed} failed`);
      }

      if (result.documents_failed > 0 && result.updated_count === 0) {
        toast.error(parts.join(" · "));
      } else {
        toast.success(parts.join(" · "));
      }

      setSelectedDocuments(new Set());
      // Stay on Ready view after apply
      if (view !== "ready") {
        handleViewChange("ready");
      } else {
        await loadDocuments();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply scores";
      setError(message);
      toast.error(message);
    } finally {
      setApplying(false);
      setApplyProgress(null);
      setConfirmOpen(false);
    }
  };

  const handleUpdateScores = async (document: Document) => {
    setUpdatingScores(document.id);
    try {
      const response = await updateScoresFromReducto(document.id, verifyEnabled);
      const parts = [`${response.updated_count} score(s) updated`];
      if (response.skipped_count) {
        parts.push(`${response.skipped_count} skipped (verify mismatch)`);
        const skipped = response.skipped_records ?? [];
        const details = skipped
          .slice(0, 3)
          .map(
            (r) =>
              `${r.index_number ?? "?"}: ${r.score ?? "—"} ≠ ${r.verify ?? "—"}`
          );
        if (details.length > 0) {
          const more =
            skipped.length > details.length
              ? ` (+${skipped.length - details.length} more)`
              : "";
          parts.push(details.join(", ") + more);
        }
      }
      parts.push(`${response.unmatched_count} unmatched`);
      toast.success(parts.join(" · "));

      const refreshed = await getFilteredDocuments(filters);
      setDocuments(refreshed.items);
      setTotal(refreshed.total);
      setTotalPages(refreshed.total_pages);
      setCurrentPage(refreshed.page);
      const updated = refreshed.items.find((d) => d.id === document.id);
      if (updated) {
        setSelectedDocument(updated);
      } else if (viewerOpen) {
        // Document left Ready view after apply — close or keep last known
        setSelectedDocument({
          ...document,
          scores_applied_at: response.scores_applied_at ?? new Date().toISOString(),
          scores_applied_count: response.scores_applied_count ?? response.updated_count,
          scores_unmatched_count: response.scores_unmatched_count ?? response.unmatched_count,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores");
    } finally {
      setUpdatingScores(null);
    }
  };

  const handleViewDocument = (document: Document) => {
    const index = documents.findIndex((d) => d.id === document.id);
    setSelectedIndex(index >= 0 ? index : -1);
    setSelectedDocument(document);
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
  };

  const handleNavigate = (index: number) => {
    if (index >= 0 && index < documents.length) {
      setSelectedIndex(index);
      setSelectedDocument(documents[index]);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        const fileExtension = doc.file_name.split(".").pop();
        downloadFilename = fileExtension ? `${doc.extracted_id}.${fileExtension}` : doc.extracted_id;
      }
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error("Failed to download document. Please try again.");
    }
  };

  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    if (selectedExamId) {
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        const typeLabel =
          exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
        chips.push({
          label: `Exam: ${exam.year} ${exam.series} ${typeLabel}`,
          onRemove: () => setSelectedExamId(undefined),
        });
      }
    }
    if (filters.school_id) {
      const school = schools.find((s) => s.id === filters.school_id);
      chips.push({
        label: `School: ${school ? `${school.code} - ${school.name}` : filters.school_id}`,
        onRemove: () => handleFilterChange("school_id", undefined),
      });
    }
    if (filters.subject_id) {
      const subject = subjects.find((s) => s.id === filters.subject_id);
      chips.push({
        label: `Subject: ${subject ? `${subject.code} - ${subject.name}` : filters.subject_id}`,
        onRemove: () => handleFilterChange("subject_id", undefined),
      });
    }
    if (filters.test_type) {
      chips.push({
        label: `Paper: ${filters.test_type}`,
        onRemove: () => handleFilterChange("test_type", undefined),
      });
    }
    return chips;
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    setFilters({
      page: 1,
      page_size: filters.page_size || 50,
      extraction_status: "success",
      scores_applied: view === "applied",
    });
    setSelectedDocuments(new Set());
  };

  const hasActiveFilters =
    !!selectedExamId || !!filters.school_id || !!filters.subject_id || !!filters.test_type;

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar title="Apply Scores" />

        <div className="border-b border-border bg-background px-4 py-2">
          <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Select extracted documents and apply scores into candidate records.
            </p>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/scores/data-entry/reducto-extraction">Reducto Extraction</Link>
            </Button>
          </div>
        </div>

        <div className="border-b border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-[2000px] space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[280px]">
                <SearchableSelect
                  options={examOptions}
                  value={selectedExamId || ""}
                  onValueChange={handleExamChange}
                  placeholder="Examination"
                  disabled={loadingFilters}
                  allowAll
                  allLabel="All examinations"
                  searchPlaceholder="Search examinations..."
                  emptyMessage="No examinations found"
                />
              </div>

              <div className="w-[240px]">
                <SearchableSelect
                  options={schools.map((school) => ({
                    value: school.id,
                    label: `${school.code} - ${school.name}`,
                  }))}
                  value={filters.school_id || ""}
                  onValueChange={(value) => {
                    if (value === "all" || value === "") {
                      handleFilterChange("school_id", undefined);
                    } else {
                      handleFilterChange(
                        "school_id",
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
                    }
                  }}
                  placeholder="School"
                  disabled={loadingFilters}
                  allowAll
                  allLabel="All schools"
                  searchPlaceholder="Search schools..."
                  emptyMessage="No schools found"
                />
              </div>

              <div className="w-[240px]">
                <SearchableSelect
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: `${subject.code} - ${subject.name}`,
                  }))}
                  value={filters.subject_id || ""}
                  onValueChange={(value) => {
                    if (value === "all" || value === "") {
                      handleFilterChange("subject_id", undefined);
                    } else {
                      handleFilterChange(
                        "subject_id",
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
                    }
                  }}
                  placeholder="Subject"
                  disabled={loadingFilters}
                  allowAll
                  allLabel="All subjects"
                  searchPlaceholder="Search subjects..."
                  emptyMessage="No subjects found"
                />
              </div>

              <Select
                value={filters.test_type || undefined}
                onValueChange={(value) =>
                  handleFilterChange("test_type", value === "all" ? undefined : value)
                }
                disabled={loadingFilters}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="Paper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All papers</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={loadDocuments}
                disabled={loading}
                size="sm"
                className="h-8 gap-2"
              >
                <Search className="h-4 w-4" />
                {loading ? "Fetching..." : "Fetch"}
              </Button>

              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={handleClearFilters} className="h-8">
                  Reset filters
                </Button>
              )}
            </div>

            {getActiveFilterChips().length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Active:</span>
                {getActiveFilterChips().map((chip, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="h-5 cursor-pointer gap-1 pr-1 text-xs hover:bg-secondary/80"
                    onClick={chip.onRemove}
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => handleViewChange("ready")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    view === "ready"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Ready to apply
                </button>
                <button
                  type="button"
                  onClick={() => handleViewChange("applied")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    view === "applied"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Applied
                </button>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{total.toLocaleString()}</span>{" "}
                {view === "ready" ? "ready" : "applied"}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <ApplyScoresDataTable
            documents={documents}
            loading={loading && loadingFilters}
            error={error}
            selectedDocuments={selectedDocuments}
            onSelectDocument={handleSelectDocument}
            onSelectAll={handleSelectAll}
            onClearSelection={() => setSelectedDocuments(new Set())}
            onRowClick={handleViewDocument}
            view={view}
            pageSize={filters.page_size || 50}
            onPageSizeChange={(size) =>
              setFilters((prev) => ({ ...prev, page_size: size, page: 1 }))
            }
            verifyEnabled={verifyEnabled}
            onVerifyEnabledChange={setVerifyEnabled}
            applying={applying}
            applyProgress={applyProgress}
            onApplySelected={() => setConfirmOpen(true)}
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply scores to {selectedDocuments.size} document
              {selectedDocuments.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    {verifyEnabled
                      ? "Score and verify fields must match before a score is written."
                      : "Verify is off — scores will be written without comparing to the verify field."}
                  </li>
                  {alreadyAppliedInSelection > 0 && (
                    <li className="text-amber-700">
                      {alreadyAppliedInSelection} selected document
                      {alreadyAppliedInSelection === 1 ? " was" : "s were"} already applied and will
                      be re-applied.
                    </li>
                  )}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <Button
              onClick={runBulkApply}
              disabled={applying}
              variant={verifyEnabled ? "default" : "destructive"}
            >
              {applying
                ? "Applying..."
                : verifyEnabled
                  ? "Apply with verify"
                  : "Apply without verify"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          documents={documents}
          currentIndex={selectedIndex}
          open={viewerOpen}
          onClose={handleCloseViewer}
          onNavigate={handleNavigate}
          onDownload={handleDownload}
          enableReductoPreview
          onUpdateScores={handleUpdateScores}
          updatingScores={updatingScores === selectedDocument.id}
        />
      )}
    </DashboardLayout>
  );
}
