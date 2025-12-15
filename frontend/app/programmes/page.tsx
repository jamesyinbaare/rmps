"use client";

import { useState, useEffect, useCallback } from "react";
import { ProgrammeList } from "@/components/ProgrammeList";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listProgrammes } from "@/lib/api";
import type { Programme } from "@/types/document";

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const loadProgrammes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listProgrammes(currentPage, pageSize);
      setProgrammes(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load programmes");
      console.error("Error loading programmes:", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    loadProgrammes();
  }, [loadProgrammes]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <DashboardLayout title="Programmes">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="All Programmes"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <ProgrammeList
            programmes={programmes}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            viewMode={viewMode}
          />

          {!loading && total > 0 && (
            <div className="px-6 py-4 text-sm text-muted-foreground text-center border-t border-border">
              Showing {programmes.length} of {total} programme{total !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
