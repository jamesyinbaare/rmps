"use client";

import { useState, useEffect, useCallback } from "react";
import { SchoolsTable } from "@/components/admin/SchoolsTable";
import { CreateSchoolDialog } from "@/components/admin/CreateSchoolDialog";
import { BulkUploadSchoolsDialog } from "@/components/admin/BulkUploadSchoolsDialog";
import { getSchools } from "@/lib/api";
import { toast } from "sonner";
import type { SchoolListResponse } from "@/types";
import { Plus, MoreVertical, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip } from "@/components/dashboard/StatStrip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SchoolsPage() {
  const [data, setData] = useState<SchoolListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSchools(page, 20, search || undefined, filter);
      setData(result);
    } catch (error) {
      toast.error("Failed to load schools");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handleFilterChange = (newFilter: boolean | undefined) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Schools"
        subtitle="Manage and view all schools"
        actions={
          <>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create School
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setBulkUploadDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Bulk Upload Schools
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <StatStrip
        items={[
          {
            label: "Total Schools",
            value: loading ? "..." : data.total,
            hint: data.items.length > 0 ? `Showing ${data.items.length} on this page` : undefined,
          },
        ]}
      />

      {/* Schools Table */}
      <SchoolsTable
        data={data}
        loading={loading}
        onPageChange={handlePageChange}
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
        currentSearch={search}
        currentFilter={filter}
      />

      <CreateSchoolDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={loadSchools}
      />

      <BulkUploadSchoolsDialog
        open={bulkUploadDialogOpen}
        onOpenChange={setBulkUploadDialogOpen}
        onSuccess={loadSchools}
      />
    </div>
  );
}
