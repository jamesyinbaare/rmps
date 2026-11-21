"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { SubjectsTable } from "@/components/admin/SubjectsTable";
import { CreateSubjectDialog } from "@/components/admin/CreateSubjectDialog";
import { BulkUploadSubjectsDialog } from "@/components/admin/BulkUploadSubjectsDialog";
import { listSubjects, listAllSubjects } from "@/lib/api";
import { toast } from "sonner";
import type { SubjectListResponse } from "@/types";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatStrip, type StatStripItem } from "@/components/dashboard/StatStrip";

const PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);

interface SubjectsSectionProps {
  showAddButtons?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function SubjectsSection({
  showAddButtons = true,
  createOpen: controlledCreateOpen,
  onCreateOpenChange,
  uploadOpen: controlledUploadOpen,
  onUploadOpenChange,
  page: controlledPage,
  pageSize: controlledPageSize,
  onPageChange,
  onPageSizeChange,
}: SubjectsSectionProps = {}) {
  const [data, setData] = useState<SubjectListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(20);
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [internalUploadOpen, setInternalUploadOpen] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [kpiTotal, setKpiTotal] = useState(0);
  const [kpiCore, setKpiCore] = useState(0);
  const [kpiElective, setKpiElective] = useState(0);

  const createDialogOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateDialogOpen = onCreateOpenChange ?? setInternalCreateOpen;
  const uploadDialogOpen = controlledUploadOpen ?? internalUploadOpen;
  const setUploadDialogOpen = onUploadOpenChange ?? setInternalUploadOpen;

  const page = controlledPage ?? internalPage;
  const pageSize = PAGE_SIZE_OPTIONS.has(controlledPageSize ?? internalPageSize)
    ? (controlledPageSize ?? internalPageSize)
    : 20;

  const setPage = (next: number) => {
    if (onPageChange) onPageChange(next);
    else setInternalPage(next);
  };

  const setPageSize = (next: number) => {
    if (onPageSizeChange) onPageSizeChange(next);
    else {
      setInternalPageSize(next);
      setInternalPage(1);
    }
  };

  const loadKpis = useCallback(async () => {
    try {
      const all = await listAllSubjects();
      setKpiTotal(all.length);
      setKpiCore(all.filter((s) => s.subject_type === "CORE").length);
      setKpiElective(all.filter((s) => s.subject_type === "ELECTIVE").length);
    } catch (error) {
      console.error("Failed to load subject KPIs", error);
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSubjects(page, pageSize);
      let filteredItems = result.items;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = result.items.filter(
          (s) =>
            s.code.toLowerCase().includes(searchLower) ||
            s.name.toLowerCase().includes(searchLower) ||
            (s.original_code || "").toLowerCase().includes(searchLower)
        );
      }

      if (sortField) {
        filteredItems = [...filteredItems].sort((a, b) => {
          let aVal: any = a[sortField as keyof typeof a];
          let bVal: any = b[sortField as keyof typeof b];

          if (sortField === "created_at") {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
          }

          if (sortDirection === "asc") {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
          }
        });
      }

      setData({
        ...result,
        items: filteredItems,
        total: search ? filteredItems.length : result.total,
      });
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortField, sortDirection]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
  };

  const handleSortChange = (field: string, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
  };

  const refreshAll = async () => {
    await Promise.all([loadSubjects(), loadKpis()]);
  };

  const kpiItems: StatStripItem[] = useMemo(
    () => [
      { label: "Total Subjects", value: kpiTotal },
      { label: "Core", value: kpiCore },
      { label: "Elective", value: kpiElective },
    ],
    [kpiTotal, kpiCore, kpiElective]
  );

  return (
    <div className="space-y-6">
      {showAddButtons && (
        <div className="flex justify-end gap-2">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Subject
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Upload Subjects
          </Button>
        </div>
      )}

      <StatStrip items={kpiItems} />

      <SubjectsTable
        data={data}
        loading={loading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSearchChange={handleSearchChange}
        onSortChange={handleSortChange}
        currentSearch={search}
        pageSize={pageSize}
        sortField={sortField}
        sortDirection={sortDirection}
      />

      <CreateSubjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={refreshAll}
      />

      <BulkUploadSubjectsDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={refreshAll}
      />
    </div>
  );
}
