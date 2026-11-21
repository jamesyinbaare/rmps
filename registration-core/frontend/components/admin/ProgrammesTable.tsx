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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import type { Programme, ProgrammeListResponse, ProgrammeType } from "@/types";

interface ProgrammesTableProps {
  data: ProgrammeListResponse;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (field: string, direction: "asc" | "desc") => void;
  currentSearch: string;
  pageSize: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  programmeTypes?: ProgrammeType[];
  programmeTypeId?: number | null;
  onProgrammeTypeChange?: (programmeTypeId: number | null) => void;
}

export function ProgrammesTable({
  data,
  loading,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onSortChange,
  currentSearch,
  pageSize,
  sortField,
  sortDirection,
  programmeTypes = [],
  programmeTypeId = null,
  onProgrammeTypeChange,
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

  const totalPages = Math.max(data.total_pages, 1);
  const showFrom = data.total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
  const showTo = Math.min(data.page * data.page_size, data.total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
        {onProgrammeTypeChange && (
          <Select
            value={programmeTypeId != null ? String(programmeTypeId) : "all"}
            onValueChange={(value) =>
              onProgrammeTypeChange(value === "all" ? null : parseInt(value, 10))
            }
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {programmeTypes.map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  {type.code} — {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

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
              <TableHead>Programme type</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                    {programme.programme_type_path ||
                      programme.programme_type_name ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(programme.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {showFrom} to {showTo} of {data.total} programmes
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
              disabled={loading}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              Page {data.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page - 1)}
              disabled={data.page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(data.page + 1)}
              disabled={data.page >= totalPages || loading}
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
