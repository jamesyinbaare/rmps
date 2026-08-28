"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { ApplyScoresDataTable, type AppliedView } from "@/components/ApplyScoresDataTable";
import {
  ApplyScoresResultDialog,
  applyResultFromBulk,
  applyResultFromSingle,
  sheetMetaFromDocument,
  type ApplyScoresResult,
} from "@/components/ApplyScoresResultDialog";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DataEntryPipelineNav } from "@/components/DataEntryPipelineNav";
import { ScoreDocumentFiltersBar } from "@/components/data-entry/ScoreDocumentFiltersBar";
import { OcrBulkFixDialog } from "@/components/OcrBulkFixDialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bulkUpdateScoresFromReducto,
  downloadDocument,
  getDocumentDownloadFilename,
  getAllExams,
  getFilteredDocuments,
  getUnmatchedRecords,
  getAllSchools,
  getAllSubjects,
  updateScoresFromReducto,
} from "@/lib/api";
import type {
  Document,
  Exam,
  ExamSeries,
  ExamType,
  ExtractionProvider,
  School,
  ScoreDocumentFilters,
  Subject,
} from "@/types/document";
import { DEFAULT_EXTRACTION_PROVIDER, extractionFor, extractionProviderLabel, otherExtractionProvider } from "@/types/document";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import {
  appendScopeToHref,
  clearResumeScope,
  parseOptionalInt,
  parseProvider,
  readResumeScope,
  writeResumeScope,
} from "@/lib/extraction-scope";
import type { SubjectTypeFilterValue } from "@/components/SubjectMultiSelectFilter";
import { useRouter } from "next/navigation";

function parseSubjectIdsParam(value: string | null): number[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((part) => parseInt(part.trim(), 10))
    .filter((id) => !Number.isNaN(id));
  return ids.length > 0 ? ids : undefined;
}

function parseSubjectTypeParam(value: string | null): "CORE" | "ELECTIVE" | undefined {
  if (value === "CORE" || value === "ELECTIVE") return value;
  return undefined;
}

export default function ApplyScoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examIdFromUrl = parseOptionalInt(searchParams.get("exam_id"));
  const subjectIdFromUrl = parseOptionalInt(searchParams.get("subject_id"));
  const subjectIdsParam = searchParams.get("subject_ids");
  const subjectIdsFromUrl = parseSubjectIdsParam(subjectIdsParam);
  const subjectTypeFromUrl = parseSubjectTypeParam(searchParams.get("subject_type"));
  const providerFromUrl = parseProvider(searchParams.get("provider"));
  const lastUrlQueryRef = useRef<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>(() => {
    const initial: ScoreDocumentFilters = {
      page: 1,
      page_size: 50,
      extraction_status: "success",
      scores_applied: false,
      extraction_provider: providerFromUrl ?? DEFAULT_EXTRACTION_PROVIDER,
    };
    if (examIdFromUrl) initial.exam_id = examIdFromUrl;
    if (subjectIdsFromUrl?.length) {
      initial.subject_ids = subjectIdsFromUrl;
      if (subjectIdsFromUrl.length === 1) initial.subject_id = subjectIdsFromUrl[0];
    } else if (subjectIdFromUrl) {
      initial.subject_id = subjectIdFromUrl;
      initial.subject_ids = [subjectIdFromUrl];
    }
    if (subjectTypeFromUrl) initial.subject_type = subjectTypeFromUrl;
    return initial;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(examIdFromUrl);
  const resumeHydratedRef = useRef(false);

  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyScoresResult | null>(null);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [updatingScores, setUpdatingScores] = useState<number | null>(null);

  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [showUnmatchedAlert, setShowUnmatchedAlert] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrDocumentId, setOcrDocumentId] = useState<number | undefined>();

  const view: AppliedView = filters.scores_applied === true ? "applied" : "ready";
  const applyProvider: ExtractionProvider =
    filters.extraction_provider === "reducto" ? "reducto" : DEFAULT_EXTRACTION_PROVIDER;
  const applyProviderLabel = extractionProviderLabel(applyProvider);
  const otherProvider = otherExtractionProvider(applyProvider);
  const otherProviderLabel = extractionProviderLabel(otherProvider);

  const loadUnmatchedRecords = useCallback(async () => {
    try {
      const response = await getUnmatchedRecords({ status: "pending", page: 1, page_size: 1 });
      setUnmatchedCount(response.total);
      if (response.total > 0) {
        setShowUnmatchedAlert(true);
      }
    } catch (err) {
      console.error("Error loading unmatched records:", err);
    }
  }, []);

  useEffect(() => {
    void loadUnmatchedRecords();
  }, [loadUnmatchedRecords]);

  useEffect(() => {
    if (resumeHydratedRef.current) return;
    if (
      examIdFromUrl != null ||
      subjectIdFromUrl != null ||
      subjectIdsFromUrl?.length ||
      subjectTypeFromUrl ||
      providerFromUrl
    ) {
      resumeHydratedRef.current = true;
      if (examIdFromUrl != null) setSelectedExamId(examIdFromUrl);
      setFilters((prev) => {
        const next = { ...prev, page: 1 };
        if (subjectIdsFromUrl?.length) {
          next.subject_ids = subjectIdsFromUrl;
          if (subjectIdsFromUrl.length === 1) next.subject_id = subjectIdsFromUrl[0];
          else delete next.subject_id;
        } else if (subjectIdFromUrl != null) {
          next.subject_id = subjectIdFromUrl;
          next.subject_ids = [subjectIdFromUrl];
        }
        if (subjectTypeFromUrl) next.subject_type = subjectTypeFromUrl;
        if (providerFromUrl) next.extraction_provider = providerFromUrl;
        return next;
      });
      return;
    }
    const resume = readResumeScope();
    if (!resume) return;
    resumeHydratedRef.current = true;
    setSelectedExamId(resume.exam_id);
    setFilters((prev) => ({
      ...prev,
      exam_id: resume.exam_id,
      subject_id: resume.subject_id,
      subject_ids: [resume.subject_id],
      page: 1,
    }));
  }, [examIdFromUrl, subjectIdFromUrl, subjectIdsParam, subjectTypeFromUrl, providerFromUrl]);

  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const [examsData, schoolsData, subjectsData] = await Promise.all([
          getAllExams(),
          getAllSchools(),
          getAllSubjects(),
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

  // Keep scope filters in the URL for refresh
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.exam_id) params.set("exam_id", String(filters.exam_id));
    if (filters.subject_ids?.length) {
      params.set("subject_ids", filters.subject_ids.join(","));
    } else if (filters.subject_id) {
      params.set("subject_id", String(filters.subject_id));
    }
    if (filters.subject_type) params.set("subject_type", filters.subject_type);
    if (applyProvider && applyProvider !== DEFAULT_EXTRACTION_PROVIDER) {
      params.set("provider", applyProvider);
    }
    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/scores/data-entry/apply-scores${next ? `?${next}` : ""}`, {
      scroll: false,
    });
  }, [
    filters.exam_id,
    filters.subject_id,
    filters.subject_ids,
    filters.subject_type,
    applyProvider,
    router,
  ]);

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

  useEffect(() => {
    const singleSubjectId =
      filters.subject_ids?.length === 1
        ? filters.subject_ids[0]
        : filters.subject_ids?.length
          ? undefined
          : filters.subject_id;
    if (filters.exam_id && singleSubjectId) {
      writeResumeScope(filters.exam_id, singleSubjectId);
    }
  }, [filters.exam_id, filters.subject_id, filters.subject_ids]);

  const pipelineSubjectId =
    filters.subject_ids?.length === 1
      ? filters.subject_ids[0]
      : filters.subject_ids?.length
        ? undefined
        : filters.subject_id;

  const pipelineScope = useMemo(
    () =>
      filters.exam_id
        ? {
            exam_id: filters.exam_id,
            subject_id: pipelineSubjectId,
            provider: applyProvider,
          }
        : null,
    [filters.exam_id, pipelineSubjectId, applyProvider]
  );

  const extractHref = useMemo(
    () =>
      appendScopeToHref("/scores/data-entry/extraction", {
        exam_id: filters.exam_id,
        subject_id: pipelineSubjectId,
      }),
    [filters.exam_id, pipelineSubjectId]
  );

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

  const handleSubjectIdsChange = (ids: number[]) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (ids.length > 0) {
        next.subject_ids = ids;
        if (ids.length === 1) next.subject_id = ids[0];
        else delete next.subject_id;
      } else {
        delete next.subject_ids;
        delete next.subject_id;
      }
      return next;
    });
    setSelectedDocuments(new Set());
  };

  const handleSubjectTypeFilterChange = (value: SubjectTypeFilterValue) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (value === "ALL") {
        delete next.subject_type;
      } else {
        next.subject_type = value;
        if (next.subject_ids?.length) {
          const allowed = new Set(
            subjects.filter((s) => s.subject_type === value).map((s) => s.id)
          );
          const pruned = next.subject_ids.filter((id) => allowed.has(id));
          if (pruned.length > 0) {
            next.subject_ids = pruned;
            if (pruned.length === 1) next.subject_id = pruned[0];
            else delete next.subject_id;
          } else {
            delete next.subject_ids;
            delete next.subject_id;
          }
        }
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
  const otherAppliedInSelection = selectedDocs.filter((d) =>
    extractionFor(d, otherProvider)?.current_applied
  ).length;
  const sheetDocumentId = useMemo(() => {
    if (selectedDocuments.size === 1) {
      return Array.from(selectedDocuments)[0];
    }
    if (selectedDocument?.id) {
      return selectedDocument.id;
    }
    if (documents.length === 1) {
      return documents[0].id;
    }
    if (selectedDocuments.size === 0 && documents[focusedRowIndex]) {
      return documents[focusedRowIndex].id;
    }
    return undefined;
  }, [selectedDocuments, selectedDocument, documents, focusedRowIndex]);

  const runBulkApply = async () => {
    const ids = Array.from(selectedDocuments);
    if (ids.length === 0) return;

    setApplying(true);
    setApplyProgress({ done: 0, total: ids.length });
    setError(null);
    try {
      const result = await bulkUpdateScoresFromReducto(
        ids,
        verifyEnabled,
        applyProvider,
        (done, totalCount) => {
          setApplyProgress({ done, total: totalCount });
        }
      );

      setApplyResult(
        applyResultFromBulk(result, {
          providerLabel: applyProviderLabel,
          verifyEnabled,
          sheets: selectedDocs.map(sheetMetaFromDocument),
        })
      );

      setSelectedDocuments(new Set());
      // Stay on Ready view after apply
      if (view !== "ready") {
        handleViewChange("ready");
      } else {
        await loadDocuments();
      }
      if (result.unmatched_count > 0) {
        await loadUnmatchedRecords();
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

  const handleUpdateScores = async (document: Document, provider?: ExtractionProvider) => {
    const appliedProvider = provider ?? applyProvider;
    setUpdatingScores(document.id);
    try {
      const response = await updateScoresFromReducto(
        document.id,
        verifyEnabled,
        appliedProvider
      );
      setApplyResult(
        applyResultFromSingle(response, document.id, {
          providerLabel: extractionProviderLabel(appliedProvider),
          verifyEnabled,
          sheets: [sheetMetaFromDocument(document)],
        })
      );

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
      if (response.unmatched_count > 0) {
        await loadUnmatchedRecords();
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
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch {
      toast.error("Failed to download document. Please try again.");
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (viewerOpen || confirmOpen || applyResult) return;

      if (e.key === "Escape") {
        setSelectedDocuments(new Set());
        return;
      }
      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSelectAll();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.min(documents.length - 1, Math.max(0, i + 1)));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === " " && documents[focusedRowIndex]) {
        e.preventDefault();
        handleSelectDocument(documents[focusedRowIndex].id);
        return;
      }
      if (e.key === "Enter" && documents[focusedRowIndex]) {
        e.preventDefault();
        handleViewDocument(documents[focusedRowIndex]);
        return;
      }
      if ((e.key === "a" || e.key === "A") && selectedDocuments.size > 0) {
        e.preventDefault();
        setConfirmOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, focusedRowIndex, selectedDocuments, viewerOpen, confirmOpen, applyResult]);

  const parseNumericFilter = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") return undefined;
    return typeof value === "number" ? value : parseInt(String(value), 10);
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    clearResumeScope();
    lastUrlQueryRef.current = "";
    router.replace("/scores/data-entry/apply-scores", { scroll: false });
    setFilters({
      page: 1,
      page_size: filters.page_size || 50,
      extraction_status: "success",
      scores_applied: view === "applied",
      extraction_provider: DEFAULT_EXTRACTION_PROVIDER,
    });
    setSelectedDocuments(new Set());
  };

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            <div className="flex min-w-0 items-baseline gap-3">
              <span>Apply Scores</span>
              <span className="hidden truncate text-sm font-normal text-muted-foreground lg:inline">
                Apply extracted scores into candidate records.
              </span>
            </div>
          }
        />

        <div className="border-b border-border bg-background px-4 py-2">
          <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-3">
            <DataEntryPipelineNav current="apply" scope={pipelineScope} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {showUnmatchedAlert && unmatchedCount > 0 && (
                <Alert className="flex max-w-xl flex-row items-center gap-2 py-1.5 [&>svg]:static [&>svg]:translate-y-0">
                  <AlertTriangle />
                  <AlertTitle className="m-0 min-h-0">
                    {unmatchedCount.toLocaleString()} unmatched
                  </AlertTitle>
                  <AlertDescription className="mt-0 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7" asChild>
                      <Link href="/scores/unmatched-records">Review unmatched</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={!sheetDocumentId}
                      title={
                        sheetDocumentId
                          ? "Preview unique OCR matches on this sheet"
                          : "Select one document to fix OCR on this sheet"
                      }
                      onClick={() => {
                        setOcrDocumentId(sheetDocumentId);
                        setOcrDialogOpen(true);
                      }}
                    >
                      Fix OCR on this sheet
                    </Button>
                  </AlertDescription>
                  <button
                    type="button"
                    className="ml-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setShowUnmatchedAlert(false)}
                    aria-label="Dismiss unmatched alert"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Alert>
              )}
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link href={extractHref}>Back to Extract</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-border bg-background px-4 py-2">
          <div className="mx-auto max-w-[2000px]">
            <ScoreDocumentFiltersBar
              examOptions={examOptions}
              selectedExamId={selectedExamId}
              onExamChange={handleExamChange}
              schools={schools}
              subjects={subjects}
              schoolId={filters.school_id}
              subjectId={filters.subject_id}
              multiSubject
              subjectIds={filters.subject_ids ?? []}
              onSubjectIdsChange={handleSubjectIdsChange}
              subjectTypeFilter={filters.subject_type ?? "ALL"}
              onSubjectTypeFilterChange={handleSubjectTypeFilterChange}
              testType={filters.test_type}
              extractionProvider={applyProvider}
              onSchoolChange={(value) => handleFilterChange("school_id", parseNumericFilter(value))}
              onSubjectChange={(value) =>
                handleFilterChange("subject_id", parseNumericFilter(value))
              }
              onTestTypeChange={(value) => handleFilterChange("test_type", value)}
              requireProvider
              loading={loadingFilters}
              onRefresh={loadDocuments}
              refreshing={loading}
              onClear={handleClearFilters}
              trailingPlacement="none"
              afterScope={
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Provider
                    </p>
                    <Tabs
                      value={applyProvider}
                      onValueChange={(value) =>
                        handleFilterChange("extraction_provider", value)
                      }
                    >
                      <TabsList className="h-8" aria-label="Apply extraction provider">
                        <TabsTrigger value="llama" className="h-7 px-3 text-xs">
                          Llama Extract
                        </TabsTrigger>
                        <TabsTrigger value="reducto" className="h-7 px-3 text-xs">
                          Reducto
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div
                    className="hidden h-8 w-px shrink-0 self-end bg-border sm:block"
                    aria-hidden
                  />
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Queue
                    </p>
                    <Tabs
                      value={view}
                      onValueChange={(value) => handleViewChange(value as AppliedView)}
                    >
                      <TabsList className="h-8" aria-label="Apply queue view">
                        <TabsTrigger value="ready" className="h-7 px-3 text-xs">
                          Ready
                          {view === "ready" ? ` (${total.toLocaleString()})` : ""}
                        </TabsTrigger>
                        <TabsTrigger value="applied" className="h-7 px-3 text-xs">
                          Applied
                          {view === "applied" ? ` (${total.toLocaleString()})` : ""}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              }
            />
          </div>
        </div>

        <div className="mx-auto mb-4 mt-3 flex min-h-0 w-full max-w-[2000px] flex-1 flex-col overflow-hidden px-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
            <ApplyScoresDataTable
              documents={documents}
              loading={loading}
              error={error}
              selectedDocuments={selectedDocuments}
              onSelectDocument={handleSelectDocument}
              onSelectAll={handleSelectAll}
              onClearSelection={() => setSelectedDocuments(new Set())}
              onRowClick={handleViewDocument}
              onApplyRow={handleUpdateScores}
              applyingDocumentId={updatingScores}
              applyProvider={applyProvider}
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
              focusedRowIndex={focusedRowIndex}
              onFocusedRowIndexChange={setFocusedRowIndex}
              currentPage={currentPage}
              totalPages={totalPages}
              total={total}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              emptyReadyTitle={`No ${applyProviderLabel} results waiting`}
              emptyReadyDescription="Switch provider, or go to Extract."
            />
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply {applyProviderLabel} scores to {selectedDocuments.size} document
              {selectedDocuments.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    Writes {applyProviderLabel} results. {otherProviderLabel} extracts on these
                    documents are not written.
                  </li>
                  <li>
                    {verifyEnabled
                      ? "Score and verify fields must match before a score is written. Mismatches with an existing raw score will be blanked (sheet IDs stay assigned)."
                      : "Verify is off — scores will be written without comparing to the verify field."}
                  </li>
                  {alreadyAppliedInSelection > 0 && (
                    <li className="text-destructive">
                      {alreadyAppliedInSelection} selected document
                      {alreadyAppliedInSelection === 1 ? " was" : "s were"} already applied and will
                      be re-applied.
                    </li>
                  )}
                  {otherAppliedInSelection > 0 && (
                    <li className="text-destructive">
                      {otherAppliedInSelection} selected document
                      {otherAppliedInSelection === 1 ? " currently has" : "s currently have"}{" "}
                      {otherProviderLabel} scores applied. Applying {applyProviderLabel} will
                      overwrite those live scores.
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
          preferredProvider={applyProvider}
          onUpdateScores={handleUpdateScores}
          updatingScores={updatingScores === selectedDocument.id}
        />
      )}

      <OcrBulkFixDialog
        open={ocrDialogOpen}
        onOpenChange={setOcrDialogOpen}
        documentId={ocrDocumentId}
        onApplied={() => {
          void loadUnmatchedRecords();
          void loadDocuments();
        }}
      />

      <ApplyScoresResultDialog
        result={applyResult}
        open={applyResult != null}
        onOpenChange={(open) => {
          if (!open) setApplyResult(null);
        }}
      />
    </DashboardLayout>
  );
}
