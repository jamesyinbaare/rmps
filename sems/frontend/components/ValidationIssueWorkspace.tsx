"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Rows2,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  API_BASE_URL,
  getValidationIssue,
  ignoreValidationIssue,
  resolveValidationIssue,
} from "@/lib/api";
import {
  createDocumentPrefetchCache,
  mapPool,
  type DocumentPrefetchCache,
} from "@/lib/document-prefetch-cache";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueDetailResponse,
  ValidationIssueType,
} from "@/types/document";

type WorkspaceLayout = "horizontal" | "vertical";

const LAYOUT_STORAGE_KEY = "sems.validationIssueWorkspace.layout";

/** How many unique upcoming score sheets to keep warm. */
const PREFETCH_UNIQUE_DOCS = 3;
/** Max issues to scan ahead when collecting unique documents (NOD-heavy queues). */
const PREFETCH_ISSUE_SCAN_LIMIT = 15;
const PREFETCH_DETAIL_CONCURRENCY = 2;
const PREFETCH_BLOB_CONCURRENCY = 2;

function readStoredLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "vertical";
  try {
    const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === "vertical" || stored === "horizontal") return stored;
  } catch {
    /* ignore */
  }
  return "vertical";
}

function getIssueTypeBadge(issueType: ValidationIssueType) {
  switch (issueType) {
    case "missing_score":
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          Missing
        </Badge>
      );
    case "invalid_score":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Invalid
        </Badge>
      );
    default:
      return <Badge variant="outline">{issueType}</Badge>;
  }
}

function getFieldNameLabel(fieldName: string) {
  switch (fieldName) {
    case "obj_raw_score":
      return "Objectives Score";
    case "essay_raw_score":
      return "Essay Score";
    case "pract_raw_score":
      return "Practical Score";
    default:
      return fieldName;
  }
}

function getTaskLine(fieldName: string) {
  return getFieldNameLabel(fieldName);
}

function documentUrl(detail: Pick<ValidationIssueDetailResponse, "document_id" | "exam_id">) {
  return `${API_BASE_URL}/api/v1/documents/by-extracted-id/${detail.document_id}/download?exam_id=${detail.exam_id}`;
}

/** Stable identity for the score sheet — shared across issues on the same document. */
function documentKey(
  detail: Pick<ValidationIssueDetailResponse, "document_id" | "exam_id"> | null
): string | null {
  if (!detail?.document_id || detail.exam_id == null) return null;
  return `${detail.document_id}:${detail.exam_id}`;
}

function isPrefetchableDocument(
  detail: Pick<ValidationIssueDetailResponse, "document_id" | "exam_id"> | null
): detail is Pick<ValidationIssueDetailResponse, "document_id" | "exam_id"> & {
  document_id: string;
  exam_id: number;
} {
  return !!detail?.document_id && detail.exam_id != null;
}

export interface ValidationIssueWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: SubjectScoreValidationIssue[];
  currentIndex: number | null;
  onCurrentIndexChange: (index: number | null) => void;
  /** Called after a successful resolve/ignore so the parent can drop the issue from the queue. */
  onHandled?: (issueId: number, action: "resolved" | "ignored") => void;
  resolvedTodayHint?: number;
  /** Registrar/ops only. Dataclerks cannot ignore. */
  allowIgnore?: boolean;
}

export function ValidationIssueWorkspace({
  open,
  onOpenChange,
  issues,
  currentIndex,
  onCurrentIndexChange,
  onHandled,
  resolvedTodayHint,
  allowIgnore = false,
}: ValidationIssueWorkspaceProps) {
  const [issueDetail, setIssueDetail] = useState<ValidationIssueDetailResponse | null>(null);
  const [loadingIssueDetail, setLoadingIssueDetail] = useState(false);
  const [correctedScore, setCorrectedScore] = useState("");
  const [resolvingIssue, setResolvingIssue] = useState(false);
  const [ignoringIssue, setIgnoringIssue] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<WorkspaceLayout>("vertical");
  const [sheetOpaque, setSheetOpaque] = useState(true);
  /** Bumps when prefetch cache gains/loses blob URLs so the viewer can switch src. */
  const [prefetchEpoch, setPrefetchEpoch] = useState(0);
  const correctedScoreInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const detailCacheRef = useRef(new Map<number, ValidationIssueDetailResponse>());
  const prefetchCacheRef = useRef<DocumentPrefetchCache | null>(null);
  if (!prefetchCacheRef.current) {
    prefetchCacheRef.current = createDocumentPrefetchCache();
  }
  const prefetchCache = prefetchCacheRef.current;

  useEffect(() => {
    setLayout(readStoredLayout());
  }, []);

  useEffect(() => {
    return prefetchCache.subscribe(() => {
      setPrefetchEpoch((n) => n + 1);
    });
  }, [prefetchCache]);

  const setLayoutPreference = (next: WorkspaceLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const resetViewer = useCallback(() => {
    setZoom(1);
    setImageLoading(true);
    setImageError(false);
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
      viewerRef.current.scrollLeft = 0;
    }
  }, []);

  const loadIssueDetail = useCallback(
    async (issueId: number) => {
      setLoadingIssueDetail(true);
      try {
        const cached = detailCacheRef.current.get(issueId);
        const detail = cached ?? (await getValidationIssue(issueId));
        if (!cached) {
          detailCacheRef.current.set(issueId, detail);
        }
        const nextDocKey = documentKey(detail);
        // Only blank/reload the sheet when the underlying document changes
        if (nextDocKey !== loadedDocumentKeyRef.current) {
          resetViewer();
          loadedDocumentKeyRef.current = nextDocKey;
        }
        setIssueDetail(detail);
        setCorrectedScore(detail.current_score_value || "");

        // Warm current document immediately
        if (isPrefetchableDocument(detail) && nextDocKey) {
          void prefetchCache.ensure(
            nextDocKey,
            documentUrl(detail),
            detail.document_mime_type
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load issue details");
        console.error("Error loading issue detail:", err);
      } finally {
        setLoadingIssueDetail(false);
      }
    },
    [resetViewer, prefetchCache]
  );

  useEffect(() => {
    if (open && currentIndex !== null && issues[currentIndex]) {
      void loadIssueDetail(issues[currentIndex].id);
    }
    if (!open) {
      setIssueDetail(null);
      setCorrectedScore("");
      loadedDocumentKeyRef.current = null;
      detailCacheRef.current.clear();
      prefetchCache.clear();
      resetViewer();
    }
  }, [open, currentIndex, issues, loadIssueDetail, resetViewer, prefetchCache]);

  // Prefetch upcoming issue details + next N unique document blobs
  useEffect(() => {
    if (!open || currentIndex === null) return;

    let cancelled = false;

    const run = async () => {
      const currentKey = documentKey(issueDetail);
      const upcoming = issues.slice(
        currentIndex + 1,
        currentIndex + 1 + PREFETCH_ISSUE_SCAN_LIMIT
      );

      await mapPool(upcoming, PREFETCH_DETAIL_CONCURRENCY, async (issue) => {
        if (cancelled) return;
        if (detailCacheRef.current.has(issue.id)) return;
        try {
          const detail = await getValidationIssue(issue.id);
          if (cancelled) return;
          detailCacheRef.current.set(issue.id, detail);
        } catch {
          /* skip failed prefetch detail */
        }
      });

      if (cancelled) return;

      const uniqueKeys: string[] = [];
      const keyToDetail = new Map<string, ValidationIssueDetailResponse>();
      if (currentKey && issueDetail && isPrefetchableDocument(issueDetail)) {
        uniqueKeys.push(currentKey);
        keyToDetail.set(currentKey, issueDetail);
      }

      const targetCount = uniqueKeys.length + PREFETCH_UNIQUE_DOCS;
      for (const issue of upcoming) {
        if (uniqueKeys.length >= targetCount) break;
        const detail = detailCacheRef.current.get(issue.id);
        if (!detail || !isPrefetchableDocument(detail)) continue;
        const key = documentKey(detail);
        if (!key || keyToDetail.has(key)) continue;
        keyToDetail.set(key, detail);
        uniqueKeys.push(key);
      }

      prefetchCache.retain(uniqueKeys);

      const toFetch = uniqueKeys.filter((key) => !prefetchCache.get(key));
      await mapPool(toFetch, PREFETCH_BLOB_CONCURRENCY, async (key) => {
        if (cancelled) return;
        const detail = keyToDetail.get(key);
        if (!detail || !isPrefetchableDocument(detail)) return;
        await prefetchCache.ensure(key, documentUrl(detail), detail.document_mime_type);
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [open, currentIndex, issues, issueDetail, prefetchCache]);

  useEffect(() => {
    if (open && issueDetail?.status === "pending" && !loadingIssueDetail) {
      const timer = setTimeout(() => {
        correctedScoreInputRef.current?.focus();
        correctedScoreInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, issueDetail, loadingIssueDetail]);

  const handleClose = () => {
    onOpenChange(false);
    onCurrentIndexChange(null);
  };

  const handleNavigateIssue = useCallback(
    (direction: "prev" | "next") => {
      if (currentIndex === null || issues.length === 0) return;
      const newIndex =
        direction === "prev"
          ? Math.max(0, currentIndex - 1)
          : Math.min(issues.length - 1, currentIndex + 1);
      if (newIndex !== currentIndex) {
        onCurrentIndexChange(newIndex);
      }
    },
    [currentIndex, issues.length, onCurrentIndexChange]
  );

  const canSkipNext =
    currentIndex !== null && currentIndex < issues.length - 1 && !loadingIssueDetail;
  const canGoPrev = currentIndex !== null && currentIndex > 0 && !loadingIssueDetail;

  const finishHandle = useCallback(
    (issueId: number, action: "resolved" | "ignored") => {
      const remainingCount = issues.length - 1;
      onHandled?.(issueId, action);
      if (currentIndex === null || remainingCount <= 0 || currentIndex >= remainingCount) {
        onOpenChange(false);
        onCurrentIndexChange(null);
      }
    },
    [issues.length, onHandled, currentIndex, onOpenChange, onCurrentIndexChange]
  );

  const handleResolveIssue = useCallback(async () => {
    if (!issueDetail || issueDetail.status !== "pending") return;

    const trimmed = correctedScore.trim();
    if (!trimmed) {
      toast.error("Enter a corrected score");
      correctedScoreInputRef.current?.focus();
      return;
    }

    if (issueDetail.max_score != null && issueDetail.max_score > 0) {
      const upper = trimmed.toUpperCase();
      if (!["A", "AA", "AAA"].includes(upper)) {
        if (trimmed.includes(".")) {
          toast.error("Score must be a whole number");
          return;
        }
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num < 0 || num > issueDetail.max_score) {
          toast.error(`Score must be between 0 and ${issueDetail.max_score}, or A/AA/AAA`);
          return;
        }
      }
    }

    setResolvingIssue(true);
    try {
      await resolveValidationIssue(issueDetail.id, trimmed);
      const todayLabel =
        resolvedTodayHint !== undefined
          ? ` · ${resolvedTodayHint + 1} resolved today`
          : "";
      toast.success(`Issue resolved${todayLabel}`);
      finishHandle(issueDetail.id, "resolved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve issue");
    } finally {
      setResolvingIssue(false);
    }
  }, [issueDetail, correctedScore, resolvedTodayHint, finishHandle]);

  const handleIgnoreIssue = useCallback(async () => {
    if (!allowIgnore || !issueDetail || issueDetail.status !== "pending") return;

    setIgnoringIssue(true);
    try {
      await ignoreValidationIssue(issueDetail.id);
      toast.success("Issue marked as ignored");
      finishHandle(issueDetail.id, "ignored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore issue");
    } finally {
      setIgnoringIssue(false);
    }
  }, [allowIgnore, issueDetail, finishHandle]);

  const handleSkip = useCallback(() => {
    if (!canSkipNext || resolvingIssue || ignoringIssue) return;
    handleNavigateIssue("next");
  }, [canSkipNext, resolvingIssue, ignoringIssue, handleNavigateIssue]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Ctrl/Cmd+Enter → Skip (leave unresolved); Enter alone → Resolve
      if (e.key === "Enter" && !e.shiftKey && issueDetail?.status === "pending") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSkip();
          return;
        }
        if (isInputFocused || e.target === document.body) {
          e.preventDefault();
          if (!resolvingIssue && !ignoringIssue) {
            void handleResolveIssue();
          }
          return;
        }
      }

      if (
        allowIgnore &&
        (e.ctrlKey || e.metaKey) &&
        (e.key === "i" || e.key === "I") &&
        issueDetail?.status === "pending"
      ) {
        e.preventDefault();
        if (!resolvingIssue && !ignoringIssue) {
          void handleIgnoreIssue();
        }
        return;
      }

      if (isInputFocused) {
        const input = e.target as HTMLInputElement;
        const hasSelection = input.selectionStart !== input.selectionEnd;
        const isAtStart = input.selectionStart === 0;
        const isAtEnd = input.selectionStart === input.value.length;
        if (e.key === "ArrowLeft" && !isAtStart && !hasSelection) return;
        if (e.key === "ArrowRight" && !isAtEnd && !hasSelection) return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigateIssue("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigateIssue("next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    issueDetail,
    resolvingIssue,
    ignoringIssue,
    allowIgnore,
    handleResolveIssue,
    handleIgnoreIssue,
    handleNavigateIssue,
    handleSkip,
  ]);

  const hasPdf =
    !!issueDetail?.document_id &&
    !!issueDetail.exam_id &&
    (issueDetail.document_mime_type === "application/pdf" ||
      !!issueDetail.document_file_name?.toLowerCase().endsWith(".pdf"));

  // Prefer image viewer when mime is missing — most score sheets are images and
  // Document metadata is sometimes absent even when extracted_id is set.
  const hasImage =
    !!issueDetail?.document_id &&
    !!issueDetail.exam_id &&
    !hasPdf &&
    (!issueDetail.document_mime_type ||
      issueDetail.document_mime_type.startsWith("image/"));

  const hasDocument = hasImage || hasPdf;

  const currentDocKey = documentKey(issueDetail);
  const prefetchedSheet =
    prefetchEpoch > -1 && currentDocKey ? prefetchCache.get(currentDocKey) : undefined;
  const sheetSrc =
    prefetchedSheet?.blobUrl ??
    (issueDetail && isPrefetchableDocument(issueDetail) ? documentUrl(issueDetail) : "");

  useEffect(() => {
    if (!currentDocKey) {
      setSheetOpaque(true);
      return;
    }
    setSheetOpaque(false);
    const id = window.setTimeout(() => setSheetOpaque(true), 20);
    return () => window.clearTimeout(id);
  }, [currentDocKey]);

  useEffect(() => {
    return () => {
      prefetchCache.clear();
    };
  }, [prefetchCache]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!hasImage) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.5, Math.round((z + delta) * 10) / 10)));
    }
  };

  const sideBySide = layout === "horizontal" && hasDocument;
  const queueLabel =
    currentIndex !== null && issues.length > 0
      ? `${currentIndex + 1}/${issues.length}`
      : "";

  const metaLine = issueDetail
    ? [
        issueDetail.subject_code && issueDetail.subject_name
          ? `${issueDetail.subject_code} · ${issueDetail.subject_name}`
          : issueDetail.subject_name,
        issueDetail.school_name,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const floatingActions = (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-background/80 p-0.5 shadow-sm backdrop-blur-md">
      {issues.length > 1 && (
        <>
          <span className="hidden px-1.5 text-[11px] tabular-nums text-muted-foreground sm:inline">
            {queueLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={() => handleNavigateIssue("prev")}
            disabled={!canGoPrev}
            aria-label="Previous issue"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={() => handleNavigateIssue("next")}
            disabled={!canSkipNext}
            aria-label="Next issue"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-0.5 h-3.5 w-px bg-border/50" aria-hidden />
        </>
      )}
      {hasDocument && (
        <div
          className="inline-flex rounded-md p-0.5"
          role="group"
          aria-label="Workspace layout"
        >
          <Button
            type="button"
            variant={layout === "horizontal" ? "secondary" : "ghost"}
            size="icon-sm"
            className="h-7 w-7"
            onClick={() => setLayoutPreference("horizontal")}
            aria-pressed={layout === "horizontal"}
            aria-label="Side by side"
            title="Side by side — sheet left, entry right"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant={layout === "vertical" ? "secondary" : "ghost"}
            size="icon-sm"
            className="h-7 w-7"
            onClick={() => setLayoutPreference("vertical")}
            aria-pressed={layout === "vertical"}
            aria-label="Stacked"
            title="Stacked — sheet above, entry below"
          >
            <Rows2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {hasImage && (
        <>
          <span className="mx-0.5 h-3.5 w-px bg-border/50" aria-hidden />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] tabular-nums text-muted-foreground"
                aria-label={`Zoom ${Math.round(zoom * 100)} percent`}
              >
                {Math.round(zoom * 100)}%
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-1.5" sideOffset={6}>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() =>
                    setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                  }
                  aria-label="Zoom out"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() =>
                    setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))
                  }
                  aria-label="Zoom in"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={() => {
                    setZoom(1);
                    if (viewerRef.current) {
                      viewerRef.current.scrollTop = 0;
                      viewerRef.current.scrollLeft = 0;
                    }
                  }}
                  aria-label="Fit"
                  title="Fit"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}
      {allowIgnore && issueDetail?.status === "pending" && (
        <>
          <span className="mx-0.5 h-3.5 w-px bg-border/50" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                aria-label="More actions"
                disabled={resolvingIssue || ignoringIssue}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => void handleIgnoreIssue()}
                disabled={resolvingIssue || ignoringIssue}
              >
                <XCircle className="h-3.5 w-3.5" />
                Ignore issue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <span className="mx-0.5 h-3.5 w-px bg-border/50" aria-hidden />
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7"
        onClick={handleClose}
        disabled={resolvingIssue || ignoringIssue}
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const skipTitle = "Skip leaves unresolved · Ctrl+Enter";

  const scoreEntryPending =
    issueDetail?.status === "pending" ? (
      <>
        <div
          className={`inline-flex shrink-0 flex-col gap-0.5 ${
            sideBySide ? "w-full" : "items-center"
          }`}
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Current
          </span>
          <span
            className={`inline-flex items-center justify-center rounded-md bg-muted/70 px-2.5 font-mono tabular-nums text-muted-foreground ${
              sideBySide ? "h-9 text-base" : "h-8 min-w-12 text-sm"
            }`}
          >
            {issueDetail.current_score_value ?? <span className="italic">—</span>}
          </span>
        </div>
        <div className={sideBySide ? "w-full" : "min-w-0 flex-1 sm:max-w-xs"}>
          <label
            htmlFor="corrected-score"
            className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Corrected
            {issueDetail.max_score != null && issueDetail.max_score > 0
              ? ` (max ${issueDetail.max_score})`
              : ""}
          </label>
          <Input
            ref={correctedScoreInputRef}
            id="corrected-score"
            value={correctedScore}
            onChange={(e) => setCorrectedScore(e.target.value)}
            placeholder={
              issueDetail.max_score != null && issueDetail.max_score > 0
                ? `0–${issueDetail.max_score} or A`
                : "e.g. 85"
            }
            className={`mt-0.5 font-mono focus-visible:ring-2 focus-visible:ring-ring ${
              sideBySide ? "h-11 text-lg" : "h-10 text-base"
            }`}
            autoComplete="off"
          />
        </div>
        <Button
          onClick={() => void handleResolveIssue()}
          disabled={resolvingIssue || ignoringIssue}
          className={`shrink-0 gap-1.5 transition-colors ${
            sideBySide ? "h-11 w-full" : "h-10"
          }`}
          size="sm"
        >
          {resolvingIssue ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Resolve
        </Button>
        {issues.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`shrink-0 gap-1 transition-colors ${
              sideBySide ? "h-10 w-full" : "h-10"
            }`}
            onClick={handleSkip}
            disabled={!canSkipNext || resolvingIssue || ignoringIssue}
            title={skipTitle}
            aria-label={skipTitle}
          >
            Skip
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </>
    ) : issueDetail ? (
      <div className="flex flex-wrap items-center gap-3 py-1">
        <div className="flex items-center gap-2 text-sm">
          {issueDetail.status === "resolved" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium capitalize">{issueDetail.status}</span>
        </div>
        <p className="font-mono text-base tabular-nums">
          {issueDetail.current_score_value ?? "—"}
        </p>
        {issues.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1 transition-colors"
            onClick={handleSkip}
            disabled={!canSkipNext}
            title={skipTitle}
            aria-label={skipTitle}
          >
            Skip
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    ) : null;

  const documentStage = issueDetail ? (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">
      <div className="absolute right-2 top-2 z-20">{floatingActions}</div>

      {hasDocument ? (
        <div
          ref={viewerRef}
          className={`relative h-full min-h-0 overscroll-contain transition-opacity duration-150 ease-out ${
            zoom > 1 ? "overflow-auto" : "overflow-hidden"
          } ${sheetOpaque ? "opacity-100" : "opacity-0"}`}
          onWheel={handleWheel}
        >
          {hasImage ? (
            <>
              {imageError ? (
                <div className="flex h-full min-h-48 items-center justify-center text-zinc-400">
                  <p>Unable to load document image</p>
                </div>
              ) : (
                <>
                  {imageLoading && (
                    <Skeleton className="absolute inset-0 z-10 rounded-none bg-zinc-800" />
                  )}
                  {zoom <= 1 ? (
                    <div className="absolute inset-0 flex items-center justify-center p-2">
                      <img
                        key={`doc-${issueDetail.document_id}-${issueDetail.exam_id}-${prefetchedSheet ? "b" : "n"}`}
                        src={sheetSrc}
                        alt={issueDetail.document_file_name || "Score sheet"}
                        className="max-h-full max-w-full select-none object-contain"
                        style={{
                          transform: zoom < 1 ? `scale(${zoom})` : undefined,
                          transformOrigin: "center center",
                          opacity: imageLoading ? 0 : 1,
                          transition: "opacity 0.2s ease-in-out",
                        }}
                        draggable={false}
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                          setImageLoading(false);
                          setImageError(true);
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center p-2"
                      style={{
                        width: `${zoom * 100}%`,
                        height: `${zoom * 100}%`,
                        minWidth: "100%",
                        minHeight: "100%",
                      }}
                    >
                      <img
                        key={`doc-zoom-${issueDetail.document_id}-${issueDetail.exam_id}-${prefetchedSheet ? "b" : "n"}`}
                        src={sheetSrc}
                        alt={issueDetail.document_file_name || "Score sheet"}
                        className="max-h-full max-w-full select-none object-contain"
                        style={{
                          opacity: imageLoading ? 0 : 1,
                          transition: "opacity 0.2s ease-in-out",
                        }}
                        draggable={false}
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                          setImageLoading(false);
                          setImageError(true);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <iframe
              key={`pdf-${issueDetail.document_id}-${issueDetail.exam_id}-${prefetchedSheet ? "b" : "n"}`}
              src={sheetSrc}
              title={issueDetail.document_file_name || "Score sheet PDF"}
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-zinc-400">
          <FileText className="h-12 w-12" />
          <p className="text-sm font-medium text-zinc-300">No score sheet</p>
          <p className="max-w-xs text-xs text-zinc-500">
            Enter the corrected score from your paper source
            {issueDetail.max_score != null && issueDetail.max_score > 0
              ? ` (0–${issueDetail.max_score})`
              : ""}
            .
          </p>
        </div>
      )}
    </div>
  ) : null;

  const bottomDock = issueDetail ? (
    <div className="z-20 shrink-0 border-t border-border bg-background/95 px-3 py-2.5 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2">
        <div className="flex w-full flex-col items-center gap-1 text-center">
          <p className="min-w-0 max-w-full truncate text-sm">
            <span className="font-medium text-foreground">
              {issueDetail.candidate_name || "Unknown candidate"}
            </span>
            <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
              {issueDetail.candidate_index_number || "No index"}
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {getIssueTypeBadge(issueDetail.issue_type)}
            <span className="text-xs text-muted-foreground">
              {getTaskLine(issueDetail.field_name)}
            </span>
          </div>
          {metaLine ? (
            <p className="max-w-full truncate text-[11px] text-muted-foreground/80">
              {metaLine}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-end justify-center gap-2">
          {scoreEntryPending}
        </div>
      </div>
    </div>
  ) : null;

  const sideRail = issueDetail ? (
    <div className="flex w-[300px] max-w-[36vw] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto px-5 py-5">
        <div className="min-w-0 space-y-2">
          <p className="truncate text-base font-medium leading-snug tracking-tight">
            {issueDetail.candidate_name || "Unknown candidate"}
            <span className="ml-2 font-mono text-xs font-normal tabular-nums text-muted-foreground">
              {issueDetail.candidate_index_number || "No index"}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {getIssueTypeBadge(issueDetail.issue_type)}
            <span className="text-xs text-muted-foreground">
              {getTaskLine(issueDetail.field_name)}
            </span>
          </div>
          {metaLine ? (
            <p className="text-[11px] leading-snug text-muted-foreground/80">{metaLine}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-3">{scoreEntryPending}</div>
      </div>
    </div>
  ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-2 !top-2 !left-2 !right-2 !bottom-2 !translate-x-0 !translate-y-0 !w-auto !max-w-none !h-auto !max-h-none overflow-hidden flex flex-col p-0 gap-0 rounded-xl sm:!max-w-none"
      >
        <DialogTitle className="sr-only">
          {issueDetail
            ? `Resolve validation issue for ${issueDetail.candidate_name || "unknown candidate"}`
            : "Issue details"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Review the score sheet and enter a corrected score, or skip to the next issue.
        </DialogDescription>

        {loadingIssueDetail && !issueDetail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : issueDetail ? (
          sideBySide ? (
            <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
              {documentStage}
              {sideRail}
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {documentStage}
              {bottomDock}
            </div>
          )
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Failed to load issue details
            <Button variant="ghost" size="sm" onClick={handleClose} className="ml-2">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
