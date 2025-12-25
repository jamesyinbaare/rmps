"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { getUnmatchedRecords, getUnmatchedRecord } from "@/lib/api";
import type { UnmatchedExtractionRecord } from "@/types/document";
import { Loader2, Eye } from "lucide-react";
import { UnmatchedRecordModal } from "@/components/UnmatchedRecordModal";
import { format } from "date-fns";

type UnmatchedRecordStatus = "pending" | "resolved" | "ignored";

export default function UnmatchedRecordsPage() {
  const [records, setRecords] = useState<UnmatchedExtractionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState<UnmatchedRecordStatus | "all">("all");
  const [extractionMethodFilter, setExtractionMethodFilter] = useState<string>("all");

  // Modal state
  const [selectedRecord, setSelectedRecord] = useState<UnmatchedExtractionRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [allRecords, setAllRecords] = useState<UnmatchedExtractionRecord[]>([]);

  // Load unmatched records
  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: any = {
        page,
        page_size: pageSize,
      };

      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }

      if (extractionMethodFilter !== "all") {
        filters.extraction_method = extractionMethodFilter;
      }

      const response = await getUnmatchedRecords(filters);
      setRecords(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);

      // Load all records for navigation in modal
      if (page === 1) {
        const allRecordsData: UnmatchedExtractionRecord[] = [];
        let currentPage = 1;
        let hasMore = true;

        while (hasMore && currentPage <= 50) {
          const allFilters = { ...filters, page: currentPage, page_size: 100 };
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
  }, [page, pageSize, statusFilter, extractionMethodFilter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleRecordClick = (record: UnmatchedExtractionRecord) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedRecord(null);
  };

  const handleRecordChange = (record: UnmatchedExtractionRecord) => {
    setSelectedRecord(record);
    // Update the record in the allRecords array
    setAllRecords((prev) =>
      prev.map((r) => (r.id === record.id ? record : r))
    );
    // Also update in the current page records
    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? record : r))
    );
  };

  const getStatusBadge = (status: string) => {
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
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Unmatched Records" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
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
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
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

          {/* Records Table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>Unmatched Records ({total})</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
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
                <Accordion>
                  {records.map((record) => (
                    <AccordionItem key={record.id} value={`record-${record.id}`}>
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-4 w-full pr-4">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="w-12 text-sm font-medium shrink-0">
                              {record.sn ?? "-"}
                            </div>
                            <div className="w-28 font-mono text-xs shrink-0">
                              {record.index_number ?? "-"}
                            </div>
                            <div className="flex-1 text-sm min-w-0 truncate">
                              {record.candidate_name ?? "-"}
                            </div>
                            <div className="shrink-0">
                              {getStatusBadge(record.status)}
                            </div>
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecordClick(record);
                            }}
                            className="shrink-0 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRecordClick(record);
                              }
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Score</label>
                            <p className="mt-1">{record.score ?? "-"}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Status</label>
                            <div className="mt-1">{getStatusBadge(record.status)}</div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Document ID</label>
                            <p className="mt-1 font-mono text-xs">{record.document_extracted_id ?? "-"}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">School</label>
                            <p className="mt-1">{record.document_school_name ?? "-"}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Subject</label>
                            <p className="mt-1">{record.document_subject_name ?? "-"}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Extraction Method</label>
                            <p className="mt-1">{record.extraction_method}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Created At</label>
                            <p className="mt-1">
                              {record.created_at
                                ? format(new Date(record.created_at), "yyyy-MM-dd HH:mm:ss")
                                : "-"}
                            </p>
                          </div>
                          {record.resolved_at && (
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Resolved At</label>
                              <p className="mt-1">
                                {format(new Date(record.resolved_at), "yyyy-MM-dd HH:mm:ss")}
                              </p>
                            </div>
                          )}
                          {record.raw_data && (
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">Raw Data</label>
                              <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                                {JSON.stringify(record.raw_data, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
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

        {/* Modal */}
        {selectedRecord && (
          <UnmatchedRecordModal
            record={selectedRecord}
            records={allRecords}
            open={modalOpen}
            onClose={handleCloseModal}
            onRecordChange={handleRecordChange}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
