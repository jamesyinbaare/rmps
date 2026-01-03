"use client";

import { useState, useEffect, useCallback } from "react";
import { SubjectsTable } from "@/components/admin/SubjectsTable";
import { CreateSubjectDialog } from "@/components/admin/CreateSubjectDialog";
import { BulkUploadSubjectsDialog } from "@/components/admin/BulkUploadSubjectsDialog";
import { listSubjects } from "@/lib/api";
import { toast } from "sonner";
import type { SubjectListResponse } from "@/types";
import { BookMarked, Plus, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SubjectsPage() {
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSubjects(page, 20);
      // Client-side search filtering
      let filteredItems = result.items;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = result.items.filter(
          (s) =>
            s.code.toLowerCase().includes(searchLower) ||
            s.name.toLowerCase().includes(searchLower)
        );
      }

      // Client-side sorting
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subjects</h1>
          <p className="text-muted-foreground">Manage and view all subjects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Subject
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Upload Subjects
          </Button>
        </div>
      </div>

      {/* Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookMarked className="h-5 w-5" />
            Total Subjects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{data.total}</div>
        </CardContent>
      </Card>

      {/* Table */}
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
