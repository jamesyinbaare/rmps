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
  Plus,
  RotateCcw,
  Rows2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  API_BASE_URL,
  getValidationIssue,
  ignoreValidationIssue,
  resolveValidationIssue,
} from "@/lib/api";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueDetailResponse,
  ValidationIssueType,
} from "@/types/document";

type WorkspaceLayout = "horizontal" | "vertical";

const LAYOUT_STORAGE_KEY = "sems.validationIssueWorkspace.layout";

function readStoredLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "horizontal";
  try {
    const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === "vertical" || stored === "horizontal") return stored;
  } catch {
    /* ignore */
  }
  return "horizontal";
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
  return `Enter ${getFieldNameLabel(fieldName)} from the sheet`;
}

function documentUrl(detail: ValidationIssueDetailResponse) {
  return `${API_BASE_URL}/api/v1/documents/by-extracted-id/${detail.document_id}/download?exam_id=${detail.exam_id}`;
}

/** Stable identity for the score sheet — shared across issues on the same document. */
function documentKey(detail: Pick<ValidationIssueDetailResponse, "document_id" | "exam_id"> | null): string | null {
  if (!detail?.document_id || detail.exam_id == null) return null;
  return `${detail.document_id}:${detail.exam_id}`;
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
}

export function ValidationIssueWorkspace({
  open,
  onOpenChange,
  issues,
  currentIndex,
  onCurrentIndexChange,
  onHandled,
  resolvedTodayHint,
}: ValidationIssueWorkspaceProps) {
  const [issueDetail, setIssueDetail] = useState<ValidationIssueDetailResponse | null>(null);
  const [loadingIssueDetail, setLoadingIssueDetail] = useState(false);
  const [correctedScore, setCorrectedScore] = useState("");
  const [resolvingIssue, setResolvingIssue] = useState(false);
  const [ignoringIssue, setIgnoringIssue] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<WorkspaceLayout>("horizontal");
  const correctedScoreInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setLayout(readStoredLayout());
  }, []);

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
        const detail = await getValidationIssue(issueId);
        const nextDocKey = documentKey(detail);
        // Only blank/reload the sheet when the underlying document changes
        if (nextDocKey !== loadedDocumentKeyRef.current) {
          resetViewer();
          loadedDocumentKeyRef.current = nextDocKey;
        }
        setIssueDetail(detail);
        setCorrectedScore(detail.current_score_value || "");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load issue details");
        console.error("Error loading issue detail:", err);
      } finally {
        setLoadingIssueDetail(false);
      }
    },
    [resetViewer]
  );

  useEffect(() => {
    if (open && currentIndex !== null && issues[currentIndex]) {
      void loadIssueDetail(issues[currentIndex].id);
    }
    if (!open) {
      setIssueDetail(null);
      setCorrectedScore("");
      loadedDocumentKeyRef.current = null;
      resetViewer();
    }
  }, [open, currentIndex, issues, loadIssueDetail, resetViewer]);

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

    setResolvingIssue(true);
    try {
      await resolveValidationIssue(issueDetail.id, correctedScore || undefined);
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
    if (!issueDetail || issueDetail.status !== "pending") return;

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
  }, [issueDetail, finishHandle]);

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

      if (
        (e.key === "Enter" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) &&
        !e.shiftKey &&
        issueDetail?.status === "pending"
      ) {
        if (isInputFocused || e.target === document.body || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (!resolvingIssue && !ignoringIssue) {
            void handleResolveIssue();
          }
          return;
        }
      }

      if (
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
    handleResolveIssue,
    handleIgnoreIssue,
    handleNavigateIssue,
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

  const handleWheel = (e: React.WheelEvent) => {
    if (!hasImage) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.5, Math.round((z + delta) * 10) / 10)));
    }
  };

  const issuePosition =
    currentIndex !== null ? `Issue ${currentIndex + 1} of ${issues.length}` : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton
        className="!fixed !inset-2 !top-2 !left-2 !right-2 !bottom-2 !translate-x-0 !translate-y-0 !w-auto !max-w-none !h-auto !max-h-none overflow-hidden flex flex-col p-0 gap-0 rounded-xl sm:!max-w-none"
      >
        <DialogHeader className="px-4 py-2 border-b shrink-0 space-y-0">
          {issueDetail ? (
            <div className="flex items-center justify-between gap-4 pr-8">
              <div className="min-w-0 flex items-baseline gap-3">
                <DialogTitle className="text-xl font-bold tabular-nums tracking-tight">
                  {issueDetail.candidate_index_number || "No index"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Resolve validation issue for{" "}
                  {issueDetail.candidate_name || "unknown candidate"}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-1">
                {hasDocument ? (
                  <div
                    className="inline-flex rounded-md border bg-background p-0.5"
                    role="group"
                    aria-label="Workspace layout"
                  >
                    <Button
                      type="button"
                      variant={layout === "horizontal" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => setLayoutPreference("horizontal")}
                      aria-pressed={layout === "horizontal"}
                      title="Side by side — sheet left, entry right"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      Side by side
                    </Button>
                    <Button
                      type="button"
                      variant={layout === "vertical" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => setLayoutPreference("vertical")}
                      aria-pressed={layout === "vertical"}
                      title="Stacked — sheet above, entry below"
                    >
                      <Rows2 className="h-3.5 w-3.5" />
                      Stacked
                    </Button>
                  </div>
                ) : null}
                {getIssueTypeBadge(issueDetail.issue_type)}
                {issues.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">{issuePosition}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <DialogTitle>Issue Details</DialogTitle>
              <DialogDescription>Review and resolve validation issues</DialogDescription>
            </>
          )}
        </DialogHeader>

        {loadingIssueDetail && !issueDetail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : issueDetail ? (
          (() => {
            const metaLine = [
              issueDetail.subject_code && issueDetail.subject_name
                ? `${issueDetail.subject_code} · ${issueDetail.subject_name}`
                : issueDetail.subject_name,
              issueDetail.school_name,
            ]
              .filter(Boolean)
              .join(" · ");

            const sideBySide = layout === "horizontal" && hasDocument;
            const stacked = layout === "vertical" && hasDocument;

            const entryControls = issueDetail.status === "pending" ? (
              <div
                className={`flex min-w-0 gap-3 ${
                  sideBySide
                    ? "flex-col items-stretch"
                    : stacked
                      ? "flex-wrap items-end justify-center"
                      : "flex-wrap items-end"
                }`}
              >
                <div className="shrink-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Current
                  </p>
                  <p
                    className={`mt-0.5 font-mono text-muted-foreground tabular-nums min-w-12 ${
                      stacked ? "text-lg" : "text-base"
                    }`}
                  >
                    {issueDetail.current_score_value ?? (
                      <span className="italic">—</span>
                    )}
                  </p>
                </div>
                <div
                  className={
                    sideBySide
                      ? "w-full"
                      : stacked
                        ? "w-[220px]"
                        : "flex-1 min-w-[120px] max-w-xs"
                  }
                >
                  <label
                    htmlFor="corrected-score"
                    className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Corrected
                  </label>
                  <Input
                    ref={correctedScoreInputRef}
                    id="corrected-score"
                    value={correctedScore}
                    onChange={(e) => setCorrectedScore(e.target.value)}
                    placeholder="e.g. 85"
                    className={`mt-0.5 font-mono ${
                      sideBySide || stacked ? "h-12 text-lg" : "h-10 text-base"
                    }`}
                    autoComplete="off"
                  />
                </div>
                <Button
                  onClick={() => void handleResolveIssue()}
                  disabled={resolvingIssue || ignoringIssue}
                  className={`gap-2 shrink-0 ${
                    sideBySide ? "w-full h-11" : stacked ? "h-12 px-6" : "h-10"
                  }`}
                >
                  {resolvingIssue ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Resolve
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  {issueDetail.status === "resolved" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="capitalize font-medium">{issueDetail.status}</span>
                </div>
                <p className="font-mono text-base tabular-nums">
                  {issueDetail.current_score_value ?? "—"}
                </p>
              </div>
            );

            const navControls = (
              <div className={`flex items-center gap-1.5 shrink-0 ${sideBySide ? "w-full justify-between" : stacked ? "justify-center" : ""}`}>
                {issues.length > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavigateIssue("prev")}
                      disabled={currentIndex === 0 || loadingIssueDetail}
                      className="h-8 w-8 p-0"
                      aria-label="Previous issue"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums px-1">
                      {currentIndex !== null ? currentIndex + 1 : 0}/{issues.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavigateIssue("next")}
                      disabled={
                        currentIndex === null ||
                        currentIndex === issues.length - 1 ||
                        loadingIssueDetail
                      }
                      className="h-8 w-8 p-0"
                      aria-label="Next issue"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1">
                  {issueDetail.status === "pending" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleIgnoreIssue()}
                      disabled={resolvingIssue || ignoringIssue}
                      className="h-8 gap-1 text-muted-foreground"
                    >
                      {ignoringIssue ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Ignore
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    disabled={resolvingIssue || ignoringIssue}
                    className="h-8"
                  >
                    Close
                  </Button>
                </div>
              </div>
            );

            const entryDock = (
              <div className="shrink-0 border-t bg-background">
                {/* Candidate + task context */}
                <div className="flex items-center justify-between gap-3 px-4 pt-2">
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-base font-bold text-foreground truncate tracking-tight">
                      {issueDetail.candidate_name || "Unknown candidate"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      <span className="tabular-nums font-semibold text-foreground">
                        {issueDetail.candidate_index_number || "No index"}
                      </span>
                      {" · "}
                      {getTaskLine(issueDetail.field_name)}
                      {metaLine ? ` · ${metaLine}` : ""}
                    </p>
                  </div>
                  {issues.length > 1 ? (
                    <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {currentIndex !== null ? currentIndex + 1 : 0}/{issues.length}
                    </p>
                  ) : null}
                </div>

                {/* Primary + nav in one centered row */}
                <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-2 px-4 py-2">
                  {issueDetail.status === "pending" ? (
                    <>
                      <div className="shrink-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Current
                        </p>
                        <p className="mt-0.5 font-mono text-base text-muted-foreground tabular-nums min-w-10">
                          {issueDetail.current_score_value ?? (
                            <span className="italic">—</span>
                          )}
                        </p>
                      </div>
                      <div className="w-44">
                        <label
                          htmlFor="corrected-score"
                          className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          Corrected
                        </label>
                        <Input
                          ref={correctedScoreInputRef}
                          id="corrected-score"
                          value={correctedScore}
                          onChange={(e) => setCorrectedScore(e.target.value)}
                          placeholder="e.g. 85"
                          className="mt-0.5 h-10 text-base font-mono text-center"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        onClick={() => void handleResolveIssue()}
                        disabled={resolvingIssue || ignoringIssue}
                        className="gap-2 h-10 px-4 shrink-0"
                      >
                        {resolvingIssue ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Resolving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Resolve
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex items-center gap-2 text-sm">
                        {issueDetail.status === "resolved" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="capitalize font-medium">{issueDetail.status}</span>
                      </div>
                      <p className="font-mono text-base tabular-nums">
                        {issueDetail.current_score_value ?? "—"}
                      </p>
                    </div>
                  )}

                  {issues.length > 1 ? (
                    <div className="flex items-center gap-1.5 pl-2 border-l ml-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNavigateIssue("prev")}
                        disabled={currentIndex === 0 || loadingIssueDetail}
                        className="h-9 w-9 p-0"
                        aria-label="Previous issue"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNavigateIssue("next")}
                        disabled={
                          currentIndex === null ||
                          currentIndex === issues.length - 1 ||
                          loadingIssueDetail
                        }
                        className="h-9 w-9 p-0"
                        aria-label="Next issue"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Tertiary actions */}
                <div className="flex items-center justify-between px-4 pb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleIgnoreIssue()}
                    disabled={
                      issueDetail.status !== "pending" || resolvingIssue || ignoringIssue
                    }
                    className={`h-7 gap-1 text-xs text-muted-foreground ${
                      issueDetail.status !== "pending" ? "invisible" : ""
                    }`}
                  >
                    {ignoringIssue ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Ignore
                  </Button>
                  <p className="text-[10px] text-muted-foreground hidden sm:block">
                    Enter · Ctrl+I · ←/→ · Esc
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    disabled={resolvingIssue || ignoringIssue}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    Close
                  </Button>
                </div>
              </div>
            );

            const sideRail = (
              <div className="w-[280px] max-w-[32vw] shrink-0 border-l bg-background flex flex-col min-h-0">
                <div className="flex-1 flex flex-col justify-center gap-5 px-4 py-4 overflow-y-auto">
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-snug truncate tracking-tight">
                      {issueDetail.candidate_name || "Unknown candidate"}
                    </p>
                    <p className="text-sm tabular-nums font-semibold text-foreground mt-0.5">
                      {issueDetail.candidate_index_number || "No index"}
                    </p>
                    <p className="text-sm font-medium leading-snug mt-3 text-muted-foreground">
                      {getTaskLine(issueDetail.field_name)}
                    </p>
                    {metaLine ? (
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{metaLine}</p>
                    ) : null}
                  </div>
                  {entryControls}
                  <p className="text-[11px] text-muted-foreground">
                    Enter · resolve · Ctrl+I ignore · ←/→ · Esc
                  </p>
                </div>
                <div className="border-t px-3 py-2.5 shrink-0">{navControls}</div>
              </div>
            );

            const documentPane = hasDocument ? (
              <div
                className="min-w-0 min-h-0 flex flex-col flex-1 bg-neutral-100 dark:bg-neutral-900"
              >
                {hasImage ? (
                  <div className="flex items-center gap-1 px-2 py-1 border-b bg-background shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                      }
                      aria-label="Zoom out"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] tabular-nums w-10 text-center text-muted-foreground">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
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
                      size="sm"
                      className="h-7 gap-1 text-[11px] px-2"
                      onClick={() => {
                        setZoom(1);
                        if (viewerRef.current) {
                          viewerRef.current.scrollTop = 0;
                          viewerRef.current.scrollLeft = 0;
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Fit
                    </Button>
                  </div>
                ) : null}
                <div
                  ref={viewerRef}
                  className={`relative flex-1 min-h-0 overscroll-contain ${
                    zoom > 1 ? "overflow-auto" : "overflow-hidden"
                  }`}
                  onWheel={handleWheel}
                >
                  {hasImage ? (
                    <>
                      {imageError ? (
                        <div className="flex items-center justify-center h-full min-h-48 text-muted-foreground">
                          <p>Unable to load document image</p>
                        </div>
                      ) : (
                        <>
                          {imageLoading && (
                            <Skeleton className="absolute inset-0 z-10 rounded-none" />
                          )}
                          {zoom <= 1 ? (
                            <div className="absolute inset-0 flex items-center justify-center p-2">
                              <img
                                key={`doc-${issueDetail.document_id}-${issueDetail.exam_id}`}
                                src={documentUrl(issueDetail)}
                                alt={issueDetail.document_file_name || "Score sheet"}
                                className="max-w-full max-h-full w-auto h-auto object-contain select-none rounded-sm shadow-sm bg-white"
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
                                key={`doc-zoom-${issueDetail.document_id}-${issueDetail.exam_id}`}
                                src={documentUrl(issueDetail)}
                                alt={issueDetail.document_file_name || "Score sheet"}
                                className="max-w-full max-h-full w-auto h-auto object-contain select-none rounded-sm shadow-sm bg-white"
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
                      key={`pdf-${issueDetail.document_id}-${issueDetail.exam_id}`}
                      src={documentUrl(issueDetail)}
                      title={issueDetail.document_file_name || "Score sheet PDF"}
                      className="absolute inset-0 w-full h-full border-0 bg-white"
                    />
                  )}
                </div>
              </div>
            ) : null;

            if (!hasDocument) {
              return (
                <div className="flex flex-1 flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="mx-auto w-full max-w-lg space-y-5">
                      <div className="rounded-md border border-dashed px-4 py-4 text-sm space-y-2">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          No score sheet attached
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enter the corrected score from your paper source if available, or
                          ignore if it cannot be resolved.
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-bold truncate tracking-tight">
                          {issueDetail.candidate_name || "Unknown candidate"}
                        </p>
                        <p className="text-sm tabular-nums font-semibold text-foreground mt-0.5">
                          {issueDetail.candidate_index_number || "No index"}
                        </p>
                        <p className="text-sm font-medium mt-3 text-muted-foreground">{getTaskLine(issueDetail.field_name)}</p>
                        {metaLine ? (
                          <p className="text-xs text-muted-foreground mt-1">{metaLine}</p>
                        ) : null}
                      </div>
                      {entryControls}
                      <p className="text-xs text-muted-foreground">
                        Enter · resolve · Ctrl+I ignore · ←/→ navigate · Esc close
                      </p>
                    </div>
                  </div>
                  <div className="border-t px-4 py-2 flex justify-end">{navControls}</div>
                </div>
              );
            }

            // Side by side: sheet left + flush mid-height rail (short eye travel).
            // Stacked: sheet above + entry dock below.
            if (sideBySide) {
              return (
                <div className="flex flex-1 min-h-0 flex-row overflow-hidden">
                  <div className="flex-1 min-w-0 min-h-0 flex flex-col">{documentPane}</div>
                  {sideRail}
                </div>
              );
            }

            return (
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col">{documentPane}</div>
                <div className="shrink-0">{entryDock}</div>
              </div>
            );
          })()
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground gap-2">
            <AlertCircle className="h-4 w-4" />
            Failed to load issue details
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
