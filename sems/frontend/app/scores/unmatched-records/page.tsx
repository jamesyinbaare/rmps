"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  bulkIgnoreUnmatchedRecords,
  bulkMarkUnmatchedRecordsResolved,
  getUnmatchedOcrCandidates,
  getUnmatchedRecords,
  ignoreUnmatchedRecord,
  type UnmatchedRecordsFilters,
} from "@/lib/api";
import type { UnmatchedExtractionRecord } from "@/types/document";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { UnmatchedRecordModal } from "@/components/UnmatchedRecordModal";
import { OcrBulkFixDialog } from "@/components/OcrBulkFixDialog";
import { toast } from "sonner";

type UnmatchedRecordStatus = "pending" | "resolved" | "ignored";

export default function UnmatchedRecordsPage() {
  const [records, setRecords] = useState<UnmatchedExtractionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilter, setStatusFilter] = useState<UnmatchedRecordStatus | "all">("pending");
  const [extractionMethodFilter, setExtractionMethodFilter] = useState<string>("all");
  const [ignoringId, setIgnoringId] = useState<number | null>(null);

  const [selectedRecord, setSelectedRecord] = useState<UnmatchedExtractionRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [allRecords, setAllRecords] = useState<UnmatchedExtractionRecord[]>([]);

  const [ocrNoiseTotal, setOcrNoiseTotal] = useState(0);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrDialogRecordIds, setOcrDialogRecordIds] = useState<number[] | undefined>();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const skipCheckedChangeRef = useRef(false);
  const [confirmIgnoreOpen, setConfirmIgnoreOpen] = useState(false);
  const [confirmResolvedOpen, setConfirmResolvedOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const extractionMethodParam =
    extractionMethodFilter !== "all" ? extractionMethodFilter : undefined;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: UnmatchedRecordsFilters = {
        page,
        page_size: pageSize,
        include_suggestions: true,
      };

      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }

      if (extractionMethodParam) {
        filters.extraction_method = extractionMethodParam;
      }

      const [response, ocrResponse] = await Promise.all([
        getUnmatchedRecords(filters),
        getUnmatchedOcrCandidates({
          extraction_method: extractionMethodParam,
        }),
      ]);
      setRecords(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setOcrNoiseTotal(ocrResponse.total);
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;

      if (page === 1) {
        const allRecordsData: UnmatchedExtractionRecord[] = [];
        let currentPage = 1;
        let hasMore = true;

        while (hasMore && currentPage <= 50) {
          const allFilters = { ...filters, page: currentPage, page_size: 100, include_suggestions: false };
          const allResponse = await getUnmatchedRecords(allFilters);
          allRecordsData.push(...allResponse.items);
          hasMore = currentPage < allResponse.total_pages;
          currentPage++;
        }
        setAllRecords(allRecordsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load unmatched records");
      console.error("Error loading unmatched records:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, extractionMethodParam]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const pendingOnPage = records.filter((r) => r.status === "pending");
  const allPendingSelected =
    pendingOnPage.length > 0 && pendingOnPage.every((r) => selectedIds.has(r.id));

  const handleRecordClick = (record: UnmatchedExtractionRecord) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };

  const handleStartReview = () => {
    const pool = records.length > 0 ? records : allRecords;
    const ocrFirst = pool.find((r) => r.status === "pending" && r.suggestion?.likely_ocr_noise);
    const pendingFirst = pool.find((r) => r.status === "pending");
    const doc = ocrFirst ?? pendingFirst ?? pool[0];
    if (doc) {
      handleRecordClick(doc);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedRecord(null);
    void loadRecords();
  };

  const handleRecordChange = (record: UnmatchedExtractionRecord) => {
    setSelectedRecord(record);
    setAllRecords((prev) =>
      prev.map((r) => (r.id === record.id ? record : r))
    );
    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? record : r))
    );
  };

  const handleIgnore = async (record: UnmatchedExtractionRecord) => {
    setIgnoringId(record.id);
    try {
      await ignoreUnmatchedRecord(record.id);
      toast.success("Record ignored");
      await loadRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore record");
    } finally {
      setIgnoringId(null);
    }
  };

  const handleToggleSelect = (
    record: UnmatchedExtractionRecord,
    index: number,
    shiftKey: boolean
  ) => {
    if (record.status !== "pending") return;
    if (shiftKey) {
      const fromIndex = lastSelectedIndexRef.current ?? index;
      const [start, end] = fromIndex < index ? [fromIndex, index] : [index, fromIndex];
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const rec = records[i];
          if (rec?.status === "pending") next.add(rec.id);
        }
        return next;
      });
      lastSelectedIndexRef.current = index;
      return;
    }
    lastSelectedIndexRef.current = index;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(record.id)) next.delete(record.id);
      else next.add(record.id);
      return next;
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pendingOnPage.map((r) => r.id)));
      lastSelectedIndexRef.current = pendingOnPage.length > 0 ? records.indexOf(pendingOnPage[pendingOnPage.length - 1]) : null;
    } else {
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    }
  };

  const openOcrPreview = (ids?: number[]) => {
    setOcrDialogRecordIds(ids);
    setOcrDialogOpen(true);
  };

  const handleBulkIgnore = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkIgnoreUnmatchedRecords(ids);
      toast.success(
        `${result.applied} ignored / ${result.skipped} skipped / ${result.failed} failed`
      );
      setConfirmIgnoreOpen(false);
      await loadRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore records");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkMarkResolved = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkMarkUnmatchedRecordsResolved(ids);
      toast.success(
        `${result.applied} marked resolved / ${result.skipped} skipped / ${result.failed} failed`
      );
      setConfirmResolvedOpen(false);
      await loadRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark records resolved");
    } finally {
      setBulkBusy(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "resolved":
        return <Badge className="bg-green-600">Resolved</Badge>;
      case "ignored":
        return <Badge variant="secondary">Ignored</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const pendingCount = records.filter((r) => r.status === "pending").length;
  const ocrNoiseCount = records.filter((r) => r.suggestion?.likely_ocr_noise).length;
  const reviewCount = statusFilter === "pending" ? total : pendingCount;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Unmatched Records" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Status:</label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value as UnmatchedRecordStatus | "all");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Extraction Method:</label>
                  <Select
                    value={extractionMethodFilter}
                    onValueChange={(value) => {
                      setExtractionMethodFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="AUTOMATED_EXTRACTION">Automated</SelectItem>
                      <SelectItem value="MANUAL_TRANSCRIPTION_DIGITAL">Manual Digital</SelectItem>
                      <SelectItem value="MANUAL_ENTRY_PHYSICAL">Manual Physical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Unmatched Records ({total})</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openOcrPreview()}
                  disabled={loading || ocrNoiseTotal === 0}
                >
                  <Wand2 className="h-4 w-4" />
                  Apply OCR matches
                  {ocrNoiseTotal > 0 ? ` (${ocrNoiseTotal.toLocaleString()})` : ""}
                </Button>
                <Button
                  size="sm"
                  onClick={handleStartReview}
                  disabled={loading || records.length === 0}
                >
                  <Sparkles className="h-4 w-4" />
                  Review unmatched
                  {reviewCount > 0 ? ` (${reviewCount.toLocaleString()})` : ""}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {ocrNoiseCount > 0 && (
                <p className="mb-3 text-xs text-muted-foreground">
                  {ocrNoiseCount.toLocaleString()} on this page look like OCR noise — Review opens those first.
                </p>
              )}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center py-8 text-destructive">
                  {error}
                </div>
              )}

              {!loading && !error && records.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  No unmatched records found
                </div>
              )}

              {!loading && !error && records.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPendingSelected}
                          disabled={pendingOnPage.length === 0}
                          onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                          aria-label="Select all pending on this page"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableHead>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record, index) => (
                      <TableRow
                        key={record.id}
                        className="cursor-pointer"
                        onClick={() => handleRecordClick(record)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(record.id)}
                            disabled={record.status !== "pending"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                e.preventDefault();
                                skipCheckedChangeRef.current = true;
                                handleToggleSelect(record, index, true);
                                queueMicrotask(() => {
                                  skipCheckedChangeRef.current = false;
                                });
                              }
                            }}
                            onCheckedChange={() => {
                              if (skipCheckedChangeRef.current) {
                                skipCheckedChangeRef.current = false;
                                return;
                              }
                              handleToggleSelect(record, index, false);
                            }}
                            aria-label={`Select ${record.index_number ?? record.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{record.sn ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs">{record.index_number ?? "-"}</span>
                            {record.suggestion?.likely_ocr_noise && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-[10px] text-amber-700"
                              >
                                Likely OCR noise
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {record.candidate_name ?? "-"}
                        </TableCell>
                        <TableCell>{record.score ?? "-"}</TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={() => handleRecordClick(record)}
                            >
                              Review
                            </Button>
                            {record.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={ignoringId === record.id}
                                onClick={() => void handleIgnore(record)}
                              >
                                {ignoringId === record.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Ignore"
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
                <span className="text-sm font-medium">
                  {selectedIds.size.toLocaleString()} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openOcrPreview(Array.from(selectedIds))}
                >
                  Match unique OCR
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmIgnoreOpen(true)}>
                  Ignore
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmResolvedOpen(true)}>
                  Mark resolved
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedIds(new Set());
                    lastSelectedIndexRef.current = null;
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </Card>

          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} records
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <div className="text-sm">
                  Page {page} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedRecord && (
          <UnmatchedRecordModal
            record={selectedRecord}
            records={allRecords.length > 0 ? allRecords : records}
            open={modalOpen}
            onClose={handleCloseModal}
            onRecordChange={handleRecordChange}
          />
        )}

        <OcrBulkFixDialog
          open={ocrDialogOpen}
          onOpenChange={setOcrDialogOpen}
          extractionMethod={extractionMethodParam}
          recordIds={ocrDialogRecordIds}
          onApplied={() => void loadRecords()}
          onReviewRecord={(record) => {
            setOcrDialogOpen(false);
            setSelectedRecord(record);
            setModalOpen(true);
          }}
        />

        <AlertDialog open={confirmIgnoreOpen} onOpenChange={setConfirmIgnoreOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Ignore {selectedIds.size.toLocaleString()} selected record
                {selectedIds.size === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Pending rows will be marked ignored. This does not apply scores.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkBusy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleBulkIgnore();
                }}
              >
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ignore selected"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmResolvedOpen} onOpenChange={setConfirmResolvedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Mark {selectedIds.size.toLocaleString()} selected record
                {selectedIds.size === 1 ? "" : "s"} resolved?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Marks rows resolved without applying scores or matching a candidate.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkBusy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleBulkMarkResolved();
                }}
              >
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark resolved"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
