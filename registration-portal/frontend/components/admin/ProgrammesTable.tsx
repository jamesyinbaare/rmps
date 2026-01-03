"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import type { Programme, ProgrammeListResponse } from "@/types";

interface ProgrammesTableProps {
  data: ProgrammeListResponse;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (field: string, direction: "asc" | "desc") => void;
  currentSearch: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}

export function ProgrammesTable({
  data,
  loading,
  onPageChange,
  onSearchChange,
  onSortChange,
  currentSearch,
  sortField,
  sortDirection,
}: ProgrammesTableProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentSearch);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(searchInput);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      onSortChange(field, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSortChange(field, "asc");
    }
  };

  const SortButton = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isActive = sortField === field;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1"
        onClick={() => handleSort(field)}
      >
        {children}
        <ArrowUpDown className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by code or name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
      </form>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton field="code">Code</SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="name">Name</SortButton>
              </TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No programmes found
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((programme: Programme) => (
                <TableRow
                  key={programme.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/dashboard/programmes/${programme.id}`)}
                >
                  <TableCell className="font-medium font-mono">{programme.code}</TableCell>
                  <TableCell>{programme.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(programme.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(data.page - 1) * data.page_size + 1} to{" "}
            {Math.min(data.page * data.page_size, data.total)} of {data.total} programmes
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page - 1)}
              disabled={data.page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm">
              Page {data.page} of {data.total_pages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page + 1)}
              disabled={data.page >= data.total_pages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
