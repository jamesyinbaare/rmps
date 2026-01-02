"use client";

import { useState, useEffect, useCallback } from "react";
import { SchoolsTable } from "@/components/admin/SchoolsTable";
import { CreateSchoolDialog } from "@/components/admin/CreateSchoolDialog";
import { BulkUploadSchoolsDialog } from "@/components/admin/BulkUploadSchoolsDialog";
import { getSchools } from "@/lib/api";
import { toast } from "sonner";
import type { SchoolListResponse } from "@/types";
import { Building2, Plus, MoreVertical, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schools</h1>
          <p className="text-muted-foreground">Manage and view all schools</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Total Schools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{loading ? "..." : data.total}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {data.items.length > 0 && `Showing ${data.items.length} on this page`}
          </p>
        </CardContent>
      </Card>

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
