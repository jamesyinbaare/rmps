"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { DataEntryPipelineNav } from "@/components/DataEntryPipelineNav";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ExtractionActivityBoard,
  ExtractionActivityShimmerStyles,
  activityStatusFor,
} from "@/components/data-entry/ExtractionActivityBoard";
import { DocumentViewer } from "@/components/DocumentViewer";
import {
  getAllExams,
  getFilteredDocuments,
  getScoresExtractionStatusCounts,
  listExamSubjects,
  queueReductoExtraction,
  downloadDocument,
  getDocumentDownloadFilename,
} from "@/lib/api";
import type {
  Document,
  Exam,
  ExtractionProvider,
  ScoreDocumentFilters,
  Subject,
  ExamType,
} from "@/types/document";
import {
  DEFAULT_EXTRACTION_PROVIDER,
  extractionProviderLabel,
} from "@/types/document";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPLETED_WINDOW_OPTIONS,
  DEFAULT_COMPLETED_WINDOW,
  appendScopeToHref,
  parseCompletedWindow,
  parseOptionalInt,
  parseProvider,
  readCompletedWindow,
  readResumeScope,
  writeCompletedWindow,
  writeResumeScope,
  type CompletedWindow,
} from "@/lib/extraction-scope";

const LIVE_STATUSES = "queued,processing";
const COMPLETED_STATUSES = "success,error";

const LIVE_PAGE_SIZE = 1000;
const COMPLETED_PAGE_SIZE = 1000;
const MAX_DOCS_INITIAL = 5000;
const MAX_DOCS_POLLING = 2000;

function formatExamLabel(exam: Exam) {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${exam.year} ${exam.series} ${typeLabel}`;
}

export default function ExtractionActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examIdFromUrl = parseOptionalInt(searchParams.get("exam_id"));
  const subjectIdFromUrl = parseOptionalInt(searchParams.get("subject_id"));
  const providerFromUrl = parseProvider(searchParams.get("provider"));
  const completedFromUrl = parseCompletedWindow(searchParams.get("completed"));

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(examIdFromUrl);
  const [subjectId, setSubjectId] = useState<number | undefined>(subjectIdFromUrl);
  const [extractionProvider, setExtractionProvider] = useState<ExtractionProvider>(
    providerFromUrl ?? DEFAULT_EXTRACTION_PROVIDER
  );
  const [completedWindow, setCompletedWindow] = useState<CompletedWindow>(
    completedFromUrl ?? DEFAULT_COMPLETED_WINDOW
  );

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [hasLiveWork, setHasLiveWork] = useState(false);
  const [liveStatusCountsOverride, setLiveStatusCountsOverride] = useState<{
    queued: number;
    processing: number;
  } | null>(null);
  const [recentlyMovedIds, setRecentlyMovedIds] = useState<Set<number>>(new Set());
  const [requeueingDocumentId, setRequeueingDocumentId] = useState<number | null>(null);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [viewerOpen, setViewerOpen] = useState(false);

  const resumeHydratedRef = useRef(false);
  const lastUrlQueryRef = useRef<string | null>(null);
  const prevStatusRef = useRef<Map<number, string>>(new Map());
  const recentMoveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scopeReady = !!selectedExamId;

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

  const subjectOptions = useMemo(
    () =>
      subjects.map((subject) => ({
        value: subject.id,
        label: `${subject.code} - ${subject.name}`,
      })),
    [subjects]
  );

  useEffect(() => {
    if (resumeHydratedRef.current) return;

    if (examIdFromUrl != null || subjectIdFromUrl != null || providerFromUrl || completedFromUrl) {
      resumeHydratedRef.current = true;
      if (examIdFromUrl != null) setSelectedExamId(examIdFromUrl);
      if (subjectIdFromUrl != null) setSubjectId(subjectIdFromUrl);
      if (providerFromUrl) setExtractionProvider(providerFromUrl);
      if (completedFromUrl) setCompletedWindow(completedFromUrl);
      return;
    }

    const storedWindow = readCompletedWindow();
    if (storedWindow) setCompletedWindow(storedWindow);

    const resume = readResumeScope();
    if (!resume) return;
    resumeHydratedRef.current = true;
    setSelectedExamId(resume.exam_id);
    setSubjectId(resume.subject_id);
  }, [examIdFromUrl, subjectIdFromUrl, providerFromUrl, completedFromUrl]);

  useEffect(() => {
    async function loadExams() {
      setLoadingFilters(true);
      try {
        setExams(await getAllExams());
      } catch (err) {
        console.error("Error loading exams:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    void loadExams();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSubjects() {
      if (!selectedExamId) {
        setSubjects([]);
        return;
      }
      setLoadingSubjects(true);
      try {
        const examSubjects = await listExamSubjects(selectedExamId);
        if (cancelled) return;
        setSubjects(
          examSubjects
            .map((es) => ({
              id: es.subject_id,
              code: es.subject_code,
              original_code: es.original_code,
              name: es.subject_name,
              subject_type: es.subject_type,
              exam_type: "Certificate II Examinations" as ExamType,
              created_at: es.created_at,
              updated_at: es.updated_at,
            }))
            .sort((a, b) => a.code.localeCompare(b.code))
        );
      } catch (err) {
        console.error("Error loading subjects:", err);
        if (!cancelled) setSubjects([]);
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    }
    void loadSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", String(selectedExamId));
    if (subjectId) params.set("subject_id", String(subjectId));
    if (extractionProvider) params.set("provider", extractionProvider);
    if (completedWindow) params.set("completed", completedWindow);
    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/scores/data-entry/activity${next ? `?${next}` : ""}`, {
      scroll: false,
    });
  }, [selectedExamId, subjectId, extractionProvider, completedWindow, router]);

  useEffect(() => {
    if (selectedExamId && subjectId) {
      writeResumeScope(selectedExamId, subjectId);
    }
  }, [selectedExamId, subjectId]);

  useEffect(() => {
    writeCompletedWindow(completedWindow);
  }, [completedWindow]);

  const pipelineScope = useMemo(
    () =>
      selectedExamId
        ? {
            exam_id: selectedExamId,
            subject_id: subjectId,
            provider: extractionProvider,
          }
        : null,
    [selectedExamId, subjectId, extractionProvider]
  );

  const scopeFilters = useCallback((): Pick<
    ScoreDocumentFilters,
    "exam_id" | "subject_id" | "extraction_provider"
  > => {
    const filters: Pick<
      ScoreDocumentFilters,
      "exam_id" | "subject_id" | "extraction_provider"
    > = {
      exam_id: selectedExamId!,
      extraction_provider: extractionProvider,
    };
    if (subjectId != null) {
      filters.subject_id = subjectId;
    }
    return filters;
  }, [selectedExamId, subjectId, extractionProvider]);

  const loadDocuments = useCallback(
    async (isPollingUpdate = false) => {
      if (!selectedExamId) {
        setDocuments([]);
        setHasLiveWork(false);
        setLiveStatusCountsOverride(null);
        return;
      }
      if (!isPollingUpdate) {
        setLoading(true);
        setError(null);
      }
      try {
        const counts = await getScoresExtractionStatusCounts(scopeFilters()).catch(() => null);

        const mergeUniqueById = (docs: Document[]) => {
          const map = new Map<number, Document>();
          for (const d of docs) map.set(d.id, d);
          return [...map.values()];
        };

        const fetchAllPages = async (
          extraction_status: string,
          pageSize: number,
          maxDocs: number
        ) => {
          let page = 1;
          const collected: Document[] = [];
          let total = Infinity;

          while (collected.length < total && collected.length < maxDocs) {
            const response = await getFilteredDocuments({
              ...scopeFilters(),
              extraction_status,
              page,
              page_size: pageSize,
            });

            total = response.total ?? collected.length;
            collected.push(...response.items);

            if (response.items.length === 0) break;
            if (page >= response.total_pages) break;
            page += 1;
          }

          return collected;
        };

        const requiredLiveDocs = counts ? counts.queued + counts.processing : 0;
        const liveMaxDocs = requiredLiveDocs > 0 ? Math.min(requiredLiveDocs, MAX_DOCS_POLLING) : MAX_DOCS_POLLING;
        const liveItems = isPollingUpdate
          ? await fetchAllPages(LIVE_STATUSES, LIVE_PAGE_SIZE, liveMaxDocs)
          : await fetchAllPages(LIVE_STATUSES, LIVE_PAGE_SIZE, MAX_DOCS_INITIAL);

        const completedItems = isPollingUpdate
          ? await fetchAllPages(COMPLETED_STATUSES, COMPLETED_PAGE_SIZE, MAX_DOCS_POLLING)
          : await fetchAllPages(
              COMPLETED_STATUSES,
              COMPLETED_PAGE_SIZE,
              MAX_DOCS_INITIAL
            );

        const items = mergeUniqueById([...liveItems, ...completedItems]).sort((a, b) =>
          b.uploaded_at.localeCompare(a.uploaded_at)
        );

        const liveFromDocs = liveItems.some((d) => {
          const s = activityStatusFor(d, extractionProvider);
          return s === "queued" || s === "processing";
        });
        const liveFromCounts = !!counts && (counts.queued > 0 || counts.processing > 0);
        setHasLiveWork(liveFromCounts || liveFromDocs);
        setLiveStatusCountsOverride(
          counts
            ? {
                queued: counts.queued,
                processing: counts.processing,
              }
            : null
        );

        // Detect transitions
        const moved: number[] = [];
        for (const doc of items) {
          const status = activityStatusFor(doc, extractionProvider) ?? "pending";
          const prev = prevStatusRef.current.get(doc.id);
          if (prev != null && prev !== status) moved.push(doc.id);
          prevStatusRef.current.set(doc.id, status);
        }
        if (moved.length > 0) {
          setRecentlyMovedIds((prev) => {
            const next = new Set(prev);
            for (const id of moved) next.add(id);
            return next;
          });
          for (const id of moved) {
            const existing = recentMoveTimersRef.current.get(id);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              setRecentlyMovedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              recentMoveTimersRef.current.delete(id);
            }, 1200);
            recentMoveTimersRef.current.set(id, timer);
          }
        }

        setDocuments(items);
      } catch (err) {
        if (!isPollingUpdate) {
          setError(err instanceof Error ? err.message : "Failed to load activity");
        }
        console.error("Error loading activity documents:", err);
      } finally {
        if (!isPollingUpdate) setLoading(false);
      }
    },
    [scopeFilters, extractionProvider]
  );

  useEffect(() => {
    if (!scopeReady) {
      setDocuments([]);
      setHasLiveWork(false);
      return;
    }
    void loadDocuments(false);
  }, [scopeReady, loadDocuments]);

  useEffect(() => {
    if (!scopeReady) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setIsPolling(false);
      return;
    }

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!hasLiveWork) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    pollingRef.current = setInterval(() => {
      void loadDocuments(true);
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setIsPolling(false);
    };
  }, [scopeReady, hasLiveWork, loadDocuments]);

  useEffect(() => {
    return () => {
      for (const timer of recentMoveTimersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(undefined);
      setSubjectId(undefined);
      setSubjects([]);
      return;
    }
    const examId = typeof value === "number" ? value : parseInt(String(value), 10);
    setSelectedExamId(examId);
    setSubjectId(undefined);
  };

  const handleSubjectChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSubjectId(undefined);
      return;
    }
    setSubjectId(typeof value === "number" ? value : parseInt(String(value), 10));
  };

  const handleOpenDocument = (doc: Document) => {
    const index = documents.findIndex((d) => d.id === doc.id);
    setSelectedIndex(index >= 0 ? index : -1);
    setSelectedDocument(doc);
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
      toast.error("Failed to download document.");
    }
  };

  const handleRequeue = async (document: Document) => {
    setRequeueingDocumentId(document.id);
    try {
      const response = await queueReductoExtraction(
        [document.id],
        true,
        extractionProvider
      );
      if (response.queued_count > 0) {
        toast.success("Requeued for extraction");
        await loadDocuments(false);
      } else {
        toast.message("Document was not queued");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to requeue");
    } finally {
      setRequeueingDocumentId(null);
    }
  };

  const extractHref = useMemo(
    () =>
      appendScopeToHref("/scores/data-entry/extraction", {
        exam_id: selectedExamId,
        subject_id: subjectId,
      }),
    [selectedExamId, subjectId]
  );

  const applyHref = useMemo(
    () =>
      appendScopeToHref("/scores/data-entry/apply-scores", {
        exam_id: selectedExamId,
        subject_id: subjectId,
      }),
    [selectedExamId, subjectId]
  );

  return (
    <DashboardLayout>
      <ExtractionActivityShimmerStyles />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            <div className="flex min-w-0 items-baseline gap-3">
              <span>Extraction Activity</span>
              <span className="hidden truncate text-sm font-normal text-muted-foreground lg:inline">
                Watch queued sheets move through processing to done.
              </span>
            </div>
          }
          trailing={
            <div className="flex items-center gap-2">
              <DataEntryPipelineNav current="activity" scope={pipelineScope} />
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link href={extractHref}>Back to Extract</Link>
              </Button>
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link href={applyHref}>Go to Apply</Link>
              </Button>
            </div>
          }
        />

        {scopeReady ? (
          <div className="border-b border-border/80 bg-background px-4 py-2">
            <div className="mx-auto flex max-w-[2000px] flex-wrap items-center gap-2">
              <div className="w-[260px]">
                <SearchableSelect
                  options={examOptions}
                  value={selectedExamId || ""}
                  onValueChange={handleExamChange}
                  placeholder="Examination"
                  disabled={loadingFilters}
                  triggerClassName="h-8"
                />
              </div>
              <div className="w-[260px]">
                <SearchableSelect
                  options={subjectOptions}
                  value={subjectId ?? "all"}
                  onValueChange={handleSubjectChange}
                  placeholder="All subjects"
                  disabled={loadingSubjects || !selectedExamId}
                  allowAll
                  allLabel="All subjects"
                  searchPlaceholder="Search subject code or name..."
                  emptyMessage="No subjects found"
                  triggerClassName="h-8"
                />
              </div>
              <Select
                value={extractionProvider}
                onValueChange={(v) => setExtractionProvider(v as ExtractionProvider)}
              >
                <SelectTrigger size="sm" className="h-8 w-[160px]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llama">{extractionProviderLabel("llama")}</SelectItem>
                  <SelectItem value="reducto">{extractionProviderLabel("reducto")}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={completedWindow}
                onValueChange={(v) => setCompletedWindow(v as CompletedWindow)}
              >
                <SelectTrigger size="sm" className="h-8 w-[150px]">
                  <SelectValue placeholder="Completed" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLETED_WINDOW_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => void loadDocuments(false)}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
          </div>
        ) : null}

        {!scopeReady ? (
          <div className="relative mx-4 mb-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,133,63,0.08),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(0,55,100,0.06),_transparent_50%)]"
            />
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-14">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                Queue · In progress · Done
              </div>
              <p className="mt-3 text-lg font-semibold tracking-tight">
                Choose an examination to begin
              </p>
              <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground">
                Select an exam to watch queued sheets across all subjects, or narrow to one
                subject to focus the pipeline view.
              </p>
              <div className="mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Examination
                  </label>
                  <SearchableSelect
                    options={examOptions}
                    value={selectedExamId || ""}
                    onValueChange={handleExamChange}
                    placeholder="Select examination…"
                    disabled={loadingFilters}
                    triggerClassName="h-11"
                  />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 space-y-1.5 transition-opacity",
                    !selectedExamId && "opacity-60"
                  )}
                >
                  <label className="block text-xs font-medium text-muted-foreground">
                    Subject
                  </label>
                  <SearchableSelect
                    options={subjectOptions}
                    value={subjectId ?? "all"}
                    onValueChange={handleSubjectChange}
                    placeholder={
                      selectedExamId ? "All subjects" : "Select examination first"
                    }
                    disabled={loadingFilters || loadingSubjects || !selectedExamId}
                    allowAll
                    allLabel="All subjects"
                    searchPlaceholder="Search subject code or name..."
                    emptyMessage={
                      !selectedExamId ? "Select an examination first" : "No subjects found"
                    }
                    triggerClassName="h-11"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-3 mb-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
            {error ? (
              <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            {loading && documents.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading activity…
              </div>
            ) : (
              <ExtractionActivityBoard
                documents={documents}
                extractionProvider={extractionProvider}
                completedWindow={completedWindow}
                recentlyMovedIds={recentlyMovedIds}
                isPolling={isPolling}
                statusCountsOverride={liveStatusCountsOverride ?? undefined}
                requeueingDocumentId={requeueingDocumentId}
                onOpenDocument={handleOpenDocument}
                onRequeue={handleRequeue}
              />
            )}
          </div>
        )}
      </div>

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
        />
      )}
    </DashboardLayout>
  );
}
