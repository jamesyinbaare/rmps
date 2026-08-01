"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  ValidationIssueStatus,
  ValidationIssueType,
} from "@/types/document";

function getStatusBadge(status: ValidationIssueStatus) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          Open
        </Badge>
      );
    case "resolved":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Resolved
        </Badge>
      );
    case "ignored":
      return (
        <Badge variant="secondary">
          <XCircle className="h-3 w-3 mr-1" />
          Ignored
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getIssueTypeBadge(issueType: ValidationIssueType) {
  switch (issueType) {
    case "missing_score":
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          Missing Score
        </Badge>
      );
    case "invalid_score":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Invalid Score
        </Badge>
      );
    default:
      return <Badge variant="outline">{issueType}</Badge>;
  }
}

function getTestTypeLabel(testType: number) {
  switch (testType) {
    case 1:
      return "Objectives";
    case 2:
      return "Essay";
    case 3:
      return "Practical";
    default:
      return `Type ${testType}`;
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
  const [allDetailsOpen, setAllDetailsOpen] = useState(false);
  const correctedScoreInputRef = useRef<HTMLInputElement>(null);

  const loadIssueDetail = useCallback(async (issueId: number) => {
    setLoadingIssueDetail(true);
    setImageLoading(true);
    setImageError(false);
    setAllDetailsOpen(false);
    try {
      const detail = await getValidationIssue(issueId);
      setIssueDetail(detail);
      setCorrectedScore(detail.current_score_value || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load issue details");
      console.error("Error loading issue detail:", err);
    } finally {
      setLoadingIssueDetail(false);
    }
  }, []);

  useEffect(() => {
    if (open && currentIndex !== null && issues[currentIndex]) {
      loadIssueDetail(issues[currentIndex].id);
    }
    if (!open) {
      setIssueDetail(null);
      setCorrectedScore("");
      setImageLoading(true);
      setImageError(false);
      setAllDetailsOpen(false);
    }
  }, [open, currentIndex, issues, loadIssueDetail]);

  useEffect(() => {
    if (open && issueDetail?.status === "pending" && !loadingIssueDetail) {
      const timer = setTimeout(() => {
        correctedScoreInputRef.current?.focus();
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
      // Parent removes the issue; same index becomes the next item.
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

      if (e.key === "Enter" && !e.shiftKey && issueDetail?.status === "pending") {
        if (isInputFocused || e.target === document.body) {
          e.preventDefault();
          if (!resolvingIssue && !ignoringIssue) {
            void handleResolveIssue();
          }
          return;
        }
      }

      if ((e.key === "i" || e.key === "I") && !isInputFocused && issueDetail?.status === "pending") {
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

  const hasImage =
    !!issueDetail?.document_id &&
    !!issueDetail.document_mime_type?.startsWith("image/") &&
    !!issueDetail.exam_id;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="2xl:max-w-[60vw] min-w-[80vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          {issueDetail ? (
            <>
              <DialogTitle className="text-2xl font-bold">
                {issueDetail.candidate_name || "Unknown Candidate"}
              </DialogTitle>
              <DialogDescription className="text-lg font-semibold text-foreground mt-1">
                {issueDetail.candidate_index_number || "No Index Number"}
                {issueDetail.message ? (
                  <span className="block text-sm font-normal text-muted-foreground mt-1">
                    {issueDetail.message}
                  </span>
                ) : null}
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Issue Details</DialogTitle>
              <DialogDescription>Review and resolve validation issues</DialogDescription>
            </>
          )}
        </DialogHeader>

        {loadingIssueDetail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : issueDetail ? (
          <div className="flex gap-6 flex-1 overflow-hidden min-h-0">
            {hasImage && (
              <div className="w-2/3 shrink-0 border-r pr-6 overflow-y-auto flex flex-col">
                <div
                  className="relative bg-muted rounded-lg overflow-auto flex-1 flex items-center justify-center min-h-0"
                  style={{ minHeight: "400px" }}
                >
                  {imageError ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Unable to load document image</p>
                    </div>
                  ) : (
                    <>
                      {imageLoading && (
                        <Skeleton className="w-full h-full absolute inset-0 z-10" />
                      )}
                      <img
                        key={`doc-${issueDetail.document_id}-${issueDetail.exam_id}-${issueDetail.id}`}
                        src={`${API_BASE_URL}/api/v1/documents/by-extracted-id/${issueDetail.document_id}/download?exam_id=${issueDetail.exam_id}`}
                        alt={issueDetail.document_file_name || "Document"}
                        className="w-auto h-auto object-contain"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          opacity: imageLoading ? 0 : 1,
                          transition: "opacity 0.2s ease-in-out",
                        }}
                        loading="lazy"
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                          setImageLoading(false);
                          setImageError(true);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            <div
              className={`space-y-6 py-4 overflow-y-auto flex-1 min-h-0 ${
                hasImage ? "w-1/3" : "w-full"
              }`}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(issueDetail.status)}
                  {getIssueTypeBadge(issueDetail.issue_type)}
                  <Badge variant="outline" className="text-xs">
                    {getTestTypeLabel(issueDetail.test_type)}
                  </Badge>
                </div>
                {(issueDetail.subject_name || issueDetail.school_name) && (
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {issueDetail.subject_name && (
                      <p>
                        <span className="text-muted-foreground">Subject · </span>
                        <span className="font-medium">
                          {issueDetail.subject_code} - {issueDetail.subject_name}
                        </span>
                      </p>
                    )}
                    {issueDetail.school_name && (
                      <p>
                        <span className="text-muted-foreground">School · </span>
                        <span className="font-medium">{issueDetail.school_name}</span>
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Field · </span>
                      <span className="font-medium">
                        {getFieldNameLabel(issueDetail.field_name)}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t pt-4">
                <h3 className="font-semibold text-sm">Score</h3>
                {issueDetail.status === "pending" ? (
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-muted-foreground">
                        Current
                      </label>
                      <p className="text-sm mt-1 font-mono">
                        {issueDetail.current_score_value ?? (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </p>
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="corrected-score"
                        className="text-sm font-medium text-muted-foreground"
                      >
                        Corrected
                      </label>
                      <Input
                        ref={correctedScoreInputRef}
                        id="corrected-score"
                        value={correctedScore}
                        onChange={(e) => setCorrectedScore(e.target.value)}
                        placeholder="e.g. 85, A, AA"
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={() => void handleResolveIssue()}
                      disabled={resolvingIssue || ignoringIssue}
                      className="gap-2 shrink-0"
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
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Current Score Value
                    </label>
                    <p className="text-sm mt-1 font-mono">
                      {issueDetail.current_score_value ?? (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Enter · resolve · I ignore · ←/→ navigate
                </p>
              </div>

              <Collapsible open={allDetailsOpen} onOpenChange={setAllDetailsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors border-t pt-4">
                  {allDetailsOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  View All Details
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-3">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Message</p>
                      <p className="text-sm mt-1">{issueDetail.message}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Created</p>
                        <p>{format(new Date(issueDetail.created_at), "MMM d, yyyy HH:mm")}</p>
                      </div>
                      {issueDetail.resolved_at && (
                        <div>
                          <p className="text-muted-foreground">Resolved</p>
                          <p>
                            {format(new Date(issueDetail.resolved_at), "MMM d, yyyy HH:mm")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Failed to load issue details
          </div>
        )}

        {issueDetail && issueDetail.status === "pending" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={resolvingIssue || ignoringIssue}
            >
              Close
            </Button>
            <Button
              variant="ghost"
              onClick={() => void handleIgnoreIssue()}
              disabled={resolvingIssue || ignoringIssue}
              className="gap-2"
            >
              {ignoringIssue ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ignoring...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Ignore
                </>
              )}
            </Button>
          </DialogFooter>
        )}

        {issueDetail && issues.length > 1 && (
          <div className="flex items-center justify-center gap-4 border-t pt-4 px-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigateIssue("prev")}
              disabled={currentIndex === 0 || loadingIssueDetail}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Issue {currentIndex !== null ? currentIndex + 1 : 0} of {issues.length}
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
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
