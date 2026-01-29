"use client";

import * as React from "react";
import type { DashboardTableRow } from "@/lib/api";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey = keyof DashboardTableRow;
type SortDir = "asc" | "desc";

interface ExaminersDataTableProps {
  data: DashboardTableRow[];
  onRowClick: (subjectId: string, subjectName: string) => void;
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort?.key === sortKey;
  const dir = isActive ? currentSort.dir : null;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <Button
        variant="ghost"
        size="sm"
        className={
          align === "right"
            ? "-mr-3 ml-auto h-8 data-[state=open]:bg-accent"
            : "-ml-3 h-8 data-[state=open]:bg-accent"
        }
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {dir === "desc" ? (
          <ArrowDown className="ml-2 h-4 w-4" />
        ) : dir === "asc" ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    </TableHead>
  );
}

export function ExaminersDataTable({
  data,
  onRowClick,
}: ExaminersDataTableProps) {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir } | null>(
    null
  );
  const [subjectTypeFilter, setSubjectTypeFilter] = React.useState<
    Set<string>
  >(new Set());

  const uniqueSubjectTypes = React.useMemo(() => {
    const types = new Set<string>();
    data.forEach((row) => {
      const t = row.subject_type;
      if (t != null && t !== "") types.add(t);
    });
    return Array.from(types).sort();
  }, [data]);

  const filteredBySearch = React.useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase().trim();
    return data.filter(
      (row) =>
        row.subject_name.toLowerCase().includes(q) ||
        (row.subject_type ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredData = React.useMemo(() => {
    if (subjectTypeFilter.size === 0) return filteredBySearch;
    return filteredBySearch.filter((row) => {
      const t = row.subject_type ?? "";
      return subjectTypeFilter.has(t);
    });
  }, [filteredBySearch, subjectTypeFilter]);

  const sortedData = React.useMemo(() => {
    if (!sort) return filteredData;
    const key = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredData].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return dir;
      if (bVal == null) return -dir;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return dir * aVal.localeCompare(bVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return dir * (aVal - bVal);
      }
      return 0;
    });
  }, [filteredData, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" as SortDir };
      if (prev.dir === "asc") return { key, dir: "desc" as SortDir };
      return null;
    });
  };

  const toggleSubjectType = (typeVal: string, checked: boolean) => {
    setSubjectTypeFilter((prev) => {
      const next = new Set(prev);
      const currentlyIncluded =
        prev.size === 0 || prev.has(typeVal);
      if (currentlyIncluded && !checked) {
        if (prev.size === 0) {
          uniqueSubjectTypes.forEach((t) => {
            if (t !== typeVal) next.add(t);
          });
        } else {
          next.delete(typeVal);
        }
      } else if (!currentlyIncluded && checked) {
        next.add(typeVal);
      }
      return next;
    });
  };

  const subjectTypeFilterLabel =
    subjectTypeFilter.size === 0
      ? "All types"
      : `${subjectTypeFilter.size} type(s)`;

  const hasActiveFilters = search.trim() !== "" || subjectTypeFilter.size > 0;
  const resultCountText = hasActiveFilters
    ? `${sortedData.length} of ${data.length} subjects`
    : `${sortedData.length} subject${sortedData.length === 1 ? "" : "s"}`;

  const clearFilters = () => {
    setSearch("");
    setSubjectTypeFilter(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <Filter className="h-4 w-4" />
              {subjectTypeFilterLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Subject type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {uniqueSubjectTypes.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No types in data
              </div>
            ) : (
              uniqueSubjectTypes.map((typeVal) => (
                <DropdownMenuCheckboxItem
                  key={typeVal}
                  checked={
                    subjectTypeFilter.size === 0 ||
                    subjectTypeFilter.has(typeVal)
                  }
                  onCheckedChange={(checked) =>
                    toggleSubjectType(typeVal, !!checked)
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {typeVal}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Showing {resultCountText}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                label="Subject name"
                sortKey="subject_name"
                currentSort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label="Subject type"
                sortKey="subject_type"
                currentSort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label="Current active examiners"
                sortKey="active_examiner_count"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="New applications"
                sortKey="new_application_count"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row, index) => (
                <TableRow
                  key={row.subject_id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/50",
                    index % 2 === 0 ? "bg-muted/40" : "bg-background"
                  )}
                  onClick={() =>
                    onRowClick(row.subject_id, row.subject_name)
                  }
                >
                  <TableCell className="font-medium">
                    {row.subject_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.subject_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.active_examiner_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.new_application_count}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col gap-1">
                    {data.length === 0
                      ? "No subjects found."
                      : "No subjects match your search or filters."}
                    {data.length > 0 && (
                      <span className="text-xs">
                        Try adjusting search or filters.
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
