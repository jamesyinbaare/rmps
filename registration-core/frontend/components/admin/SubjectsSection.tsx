"use client";

import { useState, useEffect, useCallback } from "react";
import { SubjectsTable } from "@/components/admin/SubjectsTable";
import { CreateSubjectDialog } from "@/components/admin/CreateSubjectDialog";
import { BulkUploadSubjectsDialog } from "@/components/admin/BulkUploadSubjectsDialog";
import { listSubjects } from "@/lib/api";
import { toast } from "sonner";
import type { SubjectListResponse } from "@/types";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/dashboard/StatStrip";

interface SubjectsSectionProps {
  showAddButtons?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}

export function SubjectsSection({
  showAddButtons = true,
  createOpen: controlledCreateOpen,
  onCreateOpenChange,
  uploadOpen: controlledUploadOpen,
  onUploadOpenChange,
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
  const [page, setPage] = useState(1);
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [internalUploadOpen, setInternalUploadOpen] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const createDialogOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateDialogOpen = onCreateOpenChange ?? setInternalCreateOpen;
  const uploadDialogOpen = controlledUploadOpen ?? internalUploadOpen;
  const setUploadDialogOpen = onUploadOpenChange ?? setInternalUploadOpen;

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSubjects(page, 20);
      let filteredItems = result.items;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = result.items.filter(
          (s) =>
            s.code.toLowerCase().includes(searchLower) ||
            s.name.toLowerCase().includes(searchLower)
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
  }, [page, search, sortField, sortDirection]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSortChange = (field: string, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
  };

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

      <StatStrip items={[{ label: "Total Subjects", value: data.total }]} />

      <SubjectsTable
        data={data}
        loading={loading}
        onPageChange={handlePageChange}
        onSearchChange={handleSearchChange}
        onSortChange={handleSortChange}
        currentSearch={search}
        sortField={sortField}
        sortDirection={sortDirection}
      />

      <CreateSubjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={loadSubjects}
      />

      <BulkUploadSubjectsDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={loadSubjects}
      />
    </div>
  );
}
