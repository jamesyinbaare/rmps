"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import type {
  UnmatchedExtractionRecord,
  UnmatchedIndexMatch,
  UnmatchedIndexSuggestion,
  Document,
} from "@/types/document";
import {
  getDocument,
  getDocumentDownloadUrl,
  ignoreUnmatchedRecord,
  markUnmatchedRecordResolved,
  getUnmatchedRecord,
  getUnmatchedRecordSuggestions,
  resolveUnmatchedRecord,
} from "@/lib/api";
import { toast } from "sonner";
import { PaperChip, Kbd } from "@/components/absent-review-ui";
import {
  DiffName,
  FieldLabel,
  HighlightedIndex,
  matchHasScoreOverwrite,
  scoreFieldLabel,
} from "@/components/unmatched-review-ui";
import { ScoreEntryForm } from "./ScoreEntryForm";
import { ScoreSheetPreview, workspaceDialogClassName } from "./ScoreSheetPreview";
import {
  createDocumentPrefetchCache,
  mapPool,
} from "@/lib/document-prefetch-cache";

interface UnmatchedRecordModalProps {
  record: UnmatchedExtractionRecord;
  records: UnmatchedExtractionRecord[];
  open: boolean;
  onClose: () => void;
  onRecordChange: (record: UnmatchedExtractionRecord) => void;
}

const PREFETCH_UNIQUE_DOCS = 2;
const PREFETCH_SCAN_LIMIT = 15;
const PREFETCH_BLOB_CONCURRENCY = 2;

function scoreFieldForDocument(testType: string | null | undefined): "obj" | "essay" | "pract" | null {
  if (testType === "1") return "obj";
  if (testType === "2") return "essay";
  if (testType === "3") return "pract";
  return null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "resolved":
      return <Badge variant="default" className="bg-green-600">Resolved</Badge>;
    case "ignored":
      return <Badge variant="secondary">Ignored</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export function UnmatchedRecordModal({
  record,
  records,
  open,
  onClose,
  onRecordChange,
}: UnmatchedRecordModalProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const [suggestion, setSuggestion] = useState<UnmatchedIndexSuggestion | null>(
    record.suggestion ?? null
  );
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [picked, setPicked] = useState<UnmatchedIndexMatch | null>(null);
  const [rejectUnique, setRejectUnique] = useState(false);
  const [sheetScoresOpen, setSheetScoresOpen] = useState(false);
  const [overwriteArmed, setOverwriteArmed] = useState(false);
  const [session, setSession] = useState({ applied: 0, ignored: 0, skipped: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefetchCache = useRef(createDocumentPrefetchCache()).current;
  const [prefetchEpoch, setPrefetchEpoch] = useState(0);

  const pendingRecords = useMemo(
    () => records.filter((r) => r.status === "pending"),
    [records]
  );

  useEffect(() => prefetchCache.subscribe(() => setPrefetchEpoch((n) => n + 1)), [prefetchCache]);
  useEffect(() => () => prefetchCache.clear(), [prefetchCache]);

  useEffect(() => {
    if (record && records.length > 0) {
      const index = records.findIndex((r) => r.id === record.id);
      setCurrentIndex(index >= 0 ? index : -1);
    }
  }, [record?.id, records]);

  useEffect(() => {
    if (open && record) {
      let cancelled = false;
      setLoadingDocument(true);
      setDocumentError(false);
      void getDocument(record.document_id)
        .then((doc) => {
          if (!cancelled) setDocument(doc);
        })
        .catch(() => {
          if (!cancelled) {
            setDocument(null);
            setDocumentError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingDocument(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (!open) {
      setDocument(null);
      prefetchCache.clear();
    }
  }, [open, record?.document_id, prefetchCache]);

  useEffect(() => {
    if (!open) {
      setSession({ applied: 0, ignored: 0, skipped: 0 });
    }
  }, [open]);

  useEffect(() => {
    setSuggestion(record.suggestion ?? null);
    setSearchQuery("");
    setPicked(null);
    setRejectUnique(false);
    setSheetScoresOpen(false);
    setOverwriteArmed(false);
  }, [record.id, record.suggestion]);

  useEffect(() => {
    if (!open || !record) return;
    let cancelled = false;
    setLoadingSuggestion(true);
    void getUnmatchedRecordSuggestions(record.id)
      .then((data) => {
        if (!cancelled) setSuggestion(data);
      })
      .catch((error) => {
        console.error("Failed to load index suggestions:", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestion(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, record.id]);

  useEffect(() => {
    if (!open || !record) return;
    const handle = window.setTimeout(() => {
      const q = searchQuery.trim();
      if (!q) {
        void getUnmatchedRecordSuggestions(record.id).then(setSuggestion).catch(() => undefined);
        return;
      }
      setLoadingSuggestion(true);
      void getUnmatchedRecordSuggestions(record.id, q)
        .then(setSuggestion)
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Search failed");
        })
        .finally(() => setLoadingSuggestion(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery, open, record.id]);

  const pendingBefore = useMemo(() => {
    if (currentIndex < 0) return [];
    return records.filter((r, i) => i < currentIndex && r.status === "pending");
  }, [records, currentIndex]);

  const pendingAfter = useMemo(() => {
    if (currentIndex < 0) return [];
    return records.filter((r, i) => i > currentIndex && r.status === "pending");
  }, [records, currentIndex]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const upcoming = [...pendingAfter.slice(0, PREFETCH_SCAN_LIMIT)];
    const uniqueIds: number[] = [];
    if (record.document_id) uniqueIds.push(record.document_id);
    for (const next of upcoming) {
      if (uniqueIds.length >= 1 + PREFETCH_UNIQUE_DOCS) break;
      if (!uniqueIds.includes(next.document_id)) uniqueIds.push(next.document_id);
    }
    prefetchCache.retain(uniqueIds.map(String));
    const toFetch = uniqueIds.filter((id) => !prefetchCache.get(String(id)));
    void mapPool(toFetch, PREFETCH_BLOB_CONCURRENCY, async (id) => {
      if (cancelled) return;
      await prefetchCache.ensure(String(id), getDocumentDownloadUrl(id));
    });
    return () => {
      cancelled = true;
    };
  }, [open, record.document_id, pendingAfter, prefetchCache]);

  const handlePrevious = useCallback(() => {
    const prev = pendingBefore[pendingBefore.length - 1];
    if (prev) onRecordChange(prev);
  }, [pendingBefore, onRecordChange]);

  const handleNext = useCallback(() => {
    const next = pendingAfter[0];
    if (next) onRecordChange(next);
  }, [pendingAfter, onRecordChange]);

  const advanceToNextPending = useCallback(
    (resolvedId: number) => {
      const next =
        records.find(
          (r, i) => i > currentIndex && r.id !== resolvedId && r.status === "pending"
        ) ?? records.find((r) => r.id !== resolvedId && r.status === "pending");
      if (next) {
        onRecordChange(next);
      }
    },
    [records, currentIndex, onRecordChange]
  );

  const uniqueMatch =
    !rejectUnique && suggestion?.unique && suggestion.matches.length === 1
      ? suggestion.matches[0]
      : null;
  const selectedMatch = picked ?? uniqueMatch;
  const scoreField =
    suggestion?.score_field ?? scoreFieldForDocument(document?.test_type);
  const showSearch = rejectUnique || !uniqueMatch;
  const isPending = record.status === "pending";
  const pendingIndex = pendingRecords.findIndex((r) => r.id === record.id);
  const pendingCount = pendingRecords.length;
  const positionLabel =
    pendingIndex >= 0 && pendingCount > 0
      ? `${pendingIndex + 1} of ${pendingCount}`
      : pendingCount > 0
        ? `${pendingCount} remaining`
        : "";
  const needsOverwrite = matchHasScoreOverwrite(selectedMatch);

  const handleIgnore = useCallback(async () => {
    if (!record || record.status !== "pending") return;
    setResolving(true);
    try {
      await ignoreUnmatchedRecord(record.id);
      toast.success("Record ignored");
      setSession((s) => ({ ...s, ignored: s.ignored + 1 }));
      const updatedRecord = await getUnmatchedRecord(record.id);
      onRecordChange(updatedRecord);
      advanceToNextPending(record.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ignore record");
    } finally {
      setResolving(false);
    }
  }, [record, onRecordChange, advanceToNextPending]);

  const handleResolve = useCallback(async () => {
    if (!record || record.status !== "pending") return;
    setResolving(true);
    try {
      await markUnmatchedRecordResolved(record.id);
      toast.success("Skipped without applying");
      setSession((s) => ({ ...s, skipped: s.skipped + 1 }));
      const updatedRecord = await getUnmatchedRecord(record.id);
      onRecordChange(updatedRecord);
      advanceToNextPending(record.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark record as resolved");
    } finally {
      setResolving(false);
    }
  }, [record, onRecordChange, advanceToNextPending]);

  const applyMatch = useCallback(async () => {
    if (!record || !selectedMatch || record.status !== "pending") return;
    if (!scoreField) {
      toast.error("This document has no paper type, so the score field cannot be applied");
      return;
    }
    setResolving(true);
    try {
      await resolveUnmatchedRecord(record.id, {
        subject_registration_id: selectedMatch.subject_registration_id,
        score_field: scoreField,
        score_value: record.score,
      });
      toast.success(`Applied ${record.score ?? "score"} to ${selectedMatch.candidate_name}`);
      setSession((s) => ({ ...s, applied: s.applied + 1 }));
      setOverwriteArmed(false);
      const updatedRecord = await getUnmatchedRecord(record.id);
      onRecordChange(updatedRecord);
      advanceToNextPending(record.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply score");
    } finally {
      setResolving(false);
    }
  }, [record, selectedMatch, scoreField, onRecordChange, advanceToNextPending]);

  const handleMatchAndApply = useCallback(async () => {
    if (!selectedMatch) return;
    if (needsOverwrite && !overwriteArmed) {
      setOverwriteArmed(true);
      return;
    }
    await applyMatch();
  }, [selectedMatch, needsOverwrite, overwriteArmed, applyMatch]);

  const revealSearch = useCallback(() => {
    setRejectUnique(true);
    setPicked(null);
    setOverwriteArmed(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open || !record) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInputFocused = tag === "input" || tag === "textarea";

      if (e.key === "/" && !isInputFocused) {
        e.preventDefault();
        if (!showSearch) revealSearch();
        else searchInputRef.current?.focus();
        return;
      }

      if (isInputFocused) return;

      if (e.key === "Enter" && selectedMatch && isPending && !resolving) {
        e.preventDefault();
        void handleMatchAndApply();
        return;
      }
      if ((e.key === "i" || e.key === "I") && isPending && !resolving) {
        e.preventDefault();
        void handleIgnore();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    record,
    showSearch,
    selectedMatch,
    isPending,
    resolving,
    handleMatchAndApply,
    handleIgnore,
    handlePrevious,
    handleNext,
    revealSearch,
  ]);

  const docKey = String(record.document_id);
  const prefetched = prefetchEpoch > -1 ? prefetchCache.get(docKey) : undefined;
  const previewSrc = prefetched?.blobUrl ?? (document ? getDocumentDownloadUrl(document.id) : null);
  const previewMime = prefetched?.mimeType ?? document?.mime_type ?? null;
  const paperType = document?.test_type ? Number(document.test_type) : NaN;
  const headerContext = [
    record.document_school_name,
    record.document_subject_name,
  ]
    .filter(Boolean)
    .join(" · ");

  const applyLabel = !selectedMatch
    ? "Match and apply score"
    : overwriteArmed && needsOverwrite
      ? `Overwrite ${selectedMatch.current_score} with ${record.score ?? "score"}?`
      : `Apply ${record.score ?? "score"} to ${selectedMatch.candidate_name}`;

  const sessionBits = [
    session.applied ? `Applied ${session.applied}` : null,
    session.ignored ? `ignored ${session.ignored}` : null,
    session.skipped ? `skipped ${session.skipped}` : null,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton className={workspaceDialogClassName}>
        <DialogHeader className="px-4 py-2 border-b shrink-0 space-y-0">
          <div className="flex items-center justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight">
                <HighlightedIndex
                  highlight={suggestion?.highlight}
                  fallback={record.index_number || "No index"}
                  className="text-xl font-bold tabular-nums tracking-tight"
                />
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs">
                {record.sn != null ? `Row ${record.sn}` : "Sheet"}
                {headerContext ? ` · ${headerContext}` : ""}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!Number.isNaN(paperType) && paperType > 0 ? (
                <PaperChip testType={paperType} compact={false} />
              ) : null}
              {record.status !== "pending" ? getStatusBadge(record.status) : null}
              {pendingCount > 0 ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {pendingCount.toLocaleString()} remaining
                </span>
              ) : null}
              {pendingBefore.length > 0 || pendingAfter.length > 0 ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                    disabled={pendingBefore.length === 0}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-10 px-1 text-center text-xs tabular-nums text-muted-foreground">
                    {positionLabel || "—"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={pendingAfter.length === 0}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="relative flex min-h-0 flex-1 flex-col border-b max-lg:h-[42%] max-lg:flex-none lg:border-b-0 lg:border-r">
            <ScoreSheetPreview
              src={previewSrc}
              mimeType={previewMime}
              fileName={document?.file_name}
              alt={document?.extracted_id || document?.file_name || "Score sheet"}
              loading={loadingDocument && !prefetched}
              error={documentError && !prefetched}
              emptyMessage="Could not load score sheet"
            />
          </div>

          <div className="flex min-h-0 w-full flex-col lg:w-[min(440px,40%)] lg:shrink-0">
            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
              {pendingCount > 0 ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{positionLabel}</span>
                    {sessionBits.length > 0 ? (
                      <span>{sessionBits.join(" · ")}</span>
                    ) : (
                      <span className="tabular-nums">{pendingCount.toLocaleString()} remaining</span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.max(
                          8,
                          ((pendingIndex >= 0 ? pendingIndex : 0) + 1) /
                            Math.max(pendingCount, 1) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {isPending ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-2 divide-x">
                    <div className="min-w-0 space-y-1.5 bg-muted/30 px-3 py-2.5">
                      <FieldLabel>Sheet</FieldLabel>
                      <HighlightedIndex
                        highlight={suggestion?.highlight}
                        fallback={record.index_number || "—"}
                        className="text-base font-semibold tabular-nums tracking-tight"
                      />
                      <DiffName
                        value={record.candidate_name}
                        other={selectedMatch?.candidate_name}
                        side="left"
                        className="block text-sm font-medium"
                      />
                      <p className="text-xs text-muted-foreground">
                        Score {record.score ?? "—"}
                        {record.sn != null ? ` · Row ${record.sn}` : ""}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1.5 px-3 py-2.5">
                      <FieldLabel>Register</FieldLabel>
                      {selectedMatch ? (
                        <>
                          <p className="font-mono text-base font-semibold tabular-nums tracking-tight">
                            {selectedMatch.index_number}
                          </p>
                          <DiffName
                            value={record.candidate_name}
                            other={selectedMatch.candidate_name}
                            side="right"
                            className="block text-sm font-medium"
                          />
                          <p className="truncate text-xs text-muted-foreground">
                            {selectedMatch.school_name || "—"}
                            {` · ${scoreFieldLabel(scoreField)}`}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No unique match</p>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
                    <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground">
                      VS
                    </span>
                  </div>
                  {needsOverwrite ? (
                    <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                      {selectedMatch?.current_score} already on file — applying replaces it with{" "}
                      {record.score ?? "this score"}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border px-3 py-3">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(record.status)}
                    <p className="text-sm text-muted-foreground">This record is no longer pending.</p>
                  </div>
                </div>
              )}

              {isPending && showSearch ? (
                <div className="space-y-1.5">
                  <FieldLabel>Find another candidate</FieldLabel>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value.replace(/[^\dA-Za-z\s]/g, ""));
                        setPicked(null);
                        setOverwriteArmed(false);
                      }}
                      placeholder="Index digits or name"
                      className="h-9 pl-8 font-mono text-sm"
                    />
                  </div>
                  {loadingSuggestion ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching…
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-auto rounded-md border divide-y">
                      {(suggestion?.matches ?? []).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No matching candidate in this exam and subject.
                        </p>
                      ) : (
                        (suggestion?.matches ?? []).map((match) => {
                          const selected =
                            picked?.subject_registration_id === match.subject_registration_id;
                          return (
                            <button
                              key={match.subject_registration_id}
                              type="button"
                              className={`flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-muted/60 ${
                                selected ? "bg-primary/5" : ""
                              }`}
                              onClick={() => {
                                setPicked(match);
                                setOverwriteArmed(false);
                              }}
                            >
                              <DiffName
                                value={record.candidate_name}
                                other={match.candidate_name}
                                side="right"
                                className="font-medium"
                              />
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {match.index_number}
                                {match.school_name ? ` · ${match.school_name}` : ""}
                                {match.current_score ? ` · ${match.current_score} on file` : ""}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {document ? (
              <Collapsible open={sheetScoresOpen} onOpenChange={setSheetScoresOpen}>
                <CollapsibleTrigger className="flex w-full items-center justify-between border-t px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground [&[data-state=open]>svg]:rotate-180">
                  Sheet scores
                  <ChevronDown className="h-3.5 w-3.5 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="h-64 border-t">
                    <ScoreEntryForm document={document} compact />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="shrink-0 space-y-2 border-t bg-background px-4 py-3">
              {isPending ? (
                <>
                  {selectedMatch ? (
                    <Button
                      className="h-11 w-full gap-2"
                      variant={overwriteArmed && needsOverwrite ? "destructive" : "default"}
                      onClick={() => void handleMatchAndApply()}
                      disabled={resolving || !scoreField}
                    >
                      {resolving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span className="truncate">{applyLabel}</span>
                    </Button>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1">
                    {uniqueMatch ? (
                      <Button variant="ghost" size="sm" className="h-8" disabled={resolving} onClick={revealSearch}>
                        Not this person
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => void handleResolve()}
                        disabled={resolving}
                      >
                        Skip
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-muted-foreground"
                      onClick={() => void handleIgnore()}
                      disabled={resolving}
                    >
                      Ignore
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={resolving} className="ml-auto h-8">
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={onClose} className="h-8">
                    Close
                  </Button>
                </div>
              )}
              {isPending ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Enter</Kbd> apply
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>I</Kbd> ignore
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>/</Kbd> search
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
