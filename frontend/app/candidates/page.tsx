"use client";

import { useState, useEffect, useCallback } from "react";
import { CandidateList } from "@/components/CandidateList";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listCandidates, listSchools, listProgrammes } from "@/lib/api";
import type { Candidate, School, Programme } from "@/types/document";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | undefined>(undefined);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | undefined>(undefined);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      try {
        // Fetch schools in batches (backend limit is 100)
        const allSchoolsList: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schools = await listSchools(schoolPage, 100);
          allSchoolsList.push(...schools);
          schoolHasMore = schools.length === 100;
          schoolPage++;
        }

        const programmesData = await listProgrammes(1, 100);
        setSchools(allSchoolsList);
        setProgrammes(programmesData.items);
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    };
    loadFilters();
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listCandidates(
        currentPage,
        pageSize,
        selectedSchoolId,
        selectedProgrammeId
      );
      setCandidates(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
      console.error("Error loading candidates:", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, selectedSchoolId, selectedProgrammeId]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleSchoolFilterChange = (value: string) => {
    setSelectedSchoolId(value === "all" ? undefined : parseInt(value));
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handleProgrammeFilterChange = (value: string) => {
    setSelectedProgrammeId(value === "all" ? undefined : parseInt(value));
    setCurrentPage(1); // Reset to first page when filter changes
  };

  return (
    <DashboardLayout title="Candidates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="All Candidates"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={
            <div className="flex items-center gap-4">
              <Select value={selectedSchoolId?.toString() || "all"} onValueChange={handleSchoolFilterChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by School" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id.toString()}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedProgrammeId?.toString() || "all"} onValueChange={handleProgrammeFilterChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by Programme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programmes</SelectItem>
                  {programmes.map((programme) => (
                    <SelectItem key={programme.id} value={programme.id.toString()}>
                      {programme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <CandidateList
            candidates={candidates}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            viewMode={viewMode}
          />

          {!loading && total > 0 && (
            <div className="px-6 py-4 text-sm text-muted-foreground text-center border-t border-border">
              Showing {candidates.length} of {total} candidate{total !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
