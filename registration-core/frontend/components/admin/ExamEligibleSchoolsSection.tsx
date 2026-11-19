"use client";

import * as React from "react";
import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getExamEligibleSchools, listSchools, setExamEligibleSchools } from "@/lib/api";
import type { School } from "@/types";

interface ExamEligibleSchoolsSectionProps {
  examId: number;
  onSaved?: (count: number) => void;
}

type ActiveFilter = "all" | "active" | "inactive";
type OwnershipFilter = "all" | "private" | "public" | "unset";
type SelectionFilter = "all" | "selected" | "unselected";

function selectionToIds(selection: RowSelectionState): number[] {
  return Object.keys(selection)
    .filter((key) => selection[key])
    .map((key) => Number(key))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function idsToSelection(ids: number[]): RowSelectionState {
  const next: RowSelectionState = {};
  for (const id of ids) {
    next[String(id)] = true;
  }
  return next;
}

export function ExamEligibleSchoolsSection({ examId, onSaved }: ExamEligibleSchoolsSectionProps) {
  const [schools, setSchools] = React.useState<School[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [savedSelection, setSavedSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all");
  const [ownershipFilter, setOwnershipFilter] = React.useState<OwnershipFilter>("all");
  const [selectionFilter, setSelectionFilter] = React.useState<SelectionFilter>("all");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "code", desc: false }]);
  const [pageSize, setPageSize] = React.useState(20);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [allSchools, eligible] = await Promise.all([
        listSchools(),
        getExamEligibleSchools(examId),
      ]);
      setSchools(allSchools);
      const selection = idsToSelection(eligible.map((s) => s.id));
      setRowSelection(selection);
      setSavedSelection(selection);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load eligible schools");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedIds = React.useMemo(() => selectionToIds(rowSelection), [rowSelection]);
  const savedIds = React.useMemo(() => selectionToIds(savedSelection), [savedSelection]);
  const isDirty = React.useMemo(() => {
    if (selectedIds.length !== savedIds.length) return true;
    const saved = new Set(savedIds);
    return selectedIds.some((id) => !saved.has(id));
  }, [selectedIds, savedIds]);

  const filteredSchools = React.useMemo(() => {
    return schools.filter((school) => {
      if (activeFilter === "active" && school.is_active === false) return false;
      if (activeFilter === "inactive" && school.is_active !== false) return false;

      if (ownershipFilter === "private" && school.is_private !== true) return false;
      if (ownershipFilter === "public" && school.is_private !== false) return false;
      if (ownershipFilter === "unset" && school.is_private != null) return false;

      const isSelected = !!rowSelection[String(school.id)];
      if (selectionFilter === "selected" && !isSelected) return false;
      if (selectionFilter === "unselected" && isSelected) return false;

      return true;
    });
  }, [schools, activeFilter, ownershipFilter, selectionFilter, rowSelection]);

  const columns: ColumnDef<School>[] = React.useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? true
                  : false
            }
            ref={(el) => {
              if (el) {
                el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
              }
            }}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all on page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Select ${row.original.code}`}
          />
        ),
      },
      {
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Code
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-mono text-sm font-medium">{row.getValue("code")}</div>,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
          const active = row.original.is_active !== false;
          return (
            <Badge
              variant="secondary"
              className={
                active
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }
            >
              {active ? "Active" : "Inactive"}
            </Badge>
          );
        },
      },
      {
        id: "ownership",
        accessorFn: (row) =>
          row.is_private === true ? "Private" : row.is_private === false ? "Public" : "—",
        header: "Type",
        cell: ({ row }) => {
          const value = row.original.is_private;
          if (value === true) return <span className="text-sm">Private</span>;
          if (value === false) return <span className="text-sm">Public</span>;
          return <span className="text-sm text-muted-foreground">—</span>;
        },
      },
    ],
    []
  );

  const dataTable = useReactTable({
    data: filteredSchools,
    columns,
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!query) return true;
      const code = String(row.original.code ?? "").toLowerCase();
      const name = String(row.original.name ?? "").toLowerCase();
      return code.includes(query) || name.includes(query);
    },
    initialState: {
      pagination: { pageSize },
    },
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
  });

  React.useEffect(() => {
    if (pageSize !== dataTable.getState().pagination.pageSize) {
      dataTable.setPageSize(pageSize);
      dataTable.setPageIndex(0);
    }
  }, [pageSize, dataTable]);

  React.useEffect(() => {
    dataTable.setPageIndex(0);
  }, [globalFilter, activeFilter, ownershipFilter, selectionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectAllFiltered = () => {
    const next = { ...rowSelection };
    for (const row of dataTable.getFilteredRowModel().rows) {
      next[row.id] = true;
    }
    setRowSelection(next);
  };

  const deselectAllFiltered = () => {
    const filteredIds = new Set(dataTable.getFilteredRowModel().rows.map((r) => r.id));
    const next: RowSelectionState = {};
    for (const [id, selected] of Object.entries(rowSelection)) {
      if (selected && !filteredIds.has(id)) {
        next[id] = true;
      }
    }
    setRowSelection(next);
  };

  const clearSelection = () => setRowSelection({});

  const handleCancel = () => setRowSelection(savedSelection);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await setExamEligibleSchools(examId, selectedIds);
      const selection = idsToSelection(saved.map((s) => s.id));
      setRowSelection(selection);
      setSavedSelection(selection);
      onSaved?.(saved.length);
      toast.success(
        saved.length === 0
          ? "No schools eligible — schools will not see this examination"
          : `Saved ${saved.length} eligible school${saved.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save eligible schools");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Loading schools…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {savedIds.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          No schools selected yet. Save after selecting schools so they can register for this
          examination.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Search code or name…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={ownershipFilter}
            onValueChange={(v) => setOwnershipFilter(v as OwnershipFilter)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unset">Unset</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectionFilter}
            onValueChange={(v) => setSelectionFilter(v as SelectionFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Selection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              <SelectItem value="selected">Selected only</SelectItem>
              <SelectItem value="unselected">Not selected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
          Select all filtered
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={deselectAllFiltered}>
          Deselect filtered
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
          Clear selection
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selectedIds.length}</span> selected
          {isDirty ? " · unsaved changes" : ""}
        </span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {dataTable.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {dataTable.getRowModel().rows?.length ? (
              dataTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No schools match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {dataTable.getRowModel().rows.length}
          </span>{" "}
          of{" "}
          <span className="font-medium text-foreground">
            {dataTable.getFilteredRowModel().rows.length}
          </span>{" "}
          filtered schools
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm text-muted-foreground">Rows per page:</span>
          <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
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
            Page {dataTable.getState().pagination.pageIndex + 1} of {dataTable.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => dataTable.previousPage()}
            disabled={!dataTable.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => dataTable.nextPage()}
            disabled={!dataTable.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={!isDirty || saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? "Saving…" : "Save eligibility"}
        </Button>
      </div>
    </div>
  );
}
