"use client";

import * as React from "react";
import {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import type { Programme, RegistrationCandidate } from "@/types";
import { listSchoolProgrammes } from "@/lib/api";
import { registrationTypeLabel } from "@/lib/school-registration";
import { normalizeCandidateGender } from "@/components/school/ExamCandidateStats";
import { cn } from "@/lib/utils";

export const CANDIDATE_TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;
export type CandidateTablePageSize = (typeof CANDIDATE_TABLE_PAGE_SIZES)[number];

interface SchoolExamCandidatesTableProps {
  candidates: RegistrationCandidate[];
  loading?: boolean;
  onRowClick?: (candidate: RegistrationCandidate) => void;
  onFilteredChange?: (rows: RegistrationCandidate[]) => void;
  /** 0-based page index when pagination is controlled via URL/parent. */
  pageIndex?: number;
  pageSize?: number;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
}

const STATUS_OPTIONS = [
  { value: "INCOMPLETE", label: "Incomplete" },
  { value: "COMPLETE", label: "Complete" },
  { value: "DRAFT", label: "Draft" },
] as const;

function candidateDisplayName(c: RegistrationCandidate): string {
  if (c.name?.trim()) return c.name;
  return [c.firstname, c.lastname, c.othername].filter(Boolean).join(" ");
}

function programmeKey(c: RegistrationCandidate): string {
  if (c.programme_id != null) return `id:${c.programme_id}`;
  if (c.programme_code) return `code:${c.programme_code}`;
  return "";
}

function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETE":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "INCOMPLETE":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "DRAFT":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function genderLabel(gender: string | null | undefined): string {
  const g = normalizeCandidateGender(gender);
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  return "Unspecified";
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

function truncateText(value: string, max = 28): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function FacetedHeaderFilter({
  label,
  options,
  selected,
  onChange,
  column,
}: {
  label: string;
  options: { value: string; label: string; title?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  column: {
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
}) {
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const active = selected.length > 0;

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1 px-1.5 text-xs font-medium shadow-none",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <ListFilter className="h-3.5 w-3.5" />
            {active && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center rounded-sm px-1 text-[10px] shadow-none"
              >
                {selected.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium">Filter {label.toLowerCase()}</p>
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs shadow-none"
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            )}
          </div>
          {options.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              No options available.
            </p>
          ) : (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {options.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/60"
                    title={opt.title || opt.label}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(opt.value)}
                    />
                    <span className="min-w-0 truncate">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SchoolExamCandidatesTable({
  candidates,
  loading = false,
  onRowClick,
  onFilteredChange,
  pageIndex: pageIndexProp,
  pageSize: pageSizeProp,
  onPaginationChange,
}: SchoolExamCandidatesTableProps) {
  const paginationControlled =
    pageIndexProp != null &&
    pageSizeProp != null &&
    onPaginationChange != null;

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [programmeFilters, setProgrammeFilters] = React.useState<string[]>([]);
  const [genderFilter, setGenderFilter] = React.useState("all");
  const [internalPagination, setInternalPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 20,
    });
  const [programmes, setProgrammes] = React.useState<Programme[]>([]);

  const pagination: PaginationState = paginationControlled
    ? { pageIndex: pageIndexProp, pageSize: pageSizeProp }
    : internalPagination;

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next =
      typeof updater === "function" ? updater(pagination) : updater;
    if (paginationControlled) {
      onPaginationChange(next.pageIndex, next.pageSize);
    } else {
      setInternalPagination(next);
    }
  };

  const examId = candidates[0]?.registration_exam_id;

  React.useEffect(() => {
    if (!examId) {
      setProgrammes([]);
      return;
    }
    let cancelled = false;
    async function loadProgrammes() {
      try {
        const data = await listSchoolProgrammes(examId);
        if (!cancelled) setProgrammes(data);
      } catch {
        if (!cancelled) setProgrammes([]);
      }
    }
    void loadProgrammes();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const programmeById = React.useMemo(() => {
    const map = new Map<number, Programme>();
    for (const p of programmes) map.set(p.id, p);
    return map;
  }, [programmes]);

  const availableTypes = React.useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((c) => c.registration_type)
          .filter((t): t is string => Boolean(t))
      )
    ).sort();
  }, [candidates]);

  const availableProgrammes = React.useMemo(() => {
    const map = new Map<
      string,
      { value: string; label: string; title?: string; sortKey: string }
    >();
    for (const c of candidates) {
      const key = programmeKey(c);
      if (!key || map.has(key)) continue;

      const catalogue =
        c.programme_id != null ? programmeById.get(c.programme_id) : undefined;
      const code = catalogue?.code || c.programme_code || "—";
      const name = catalogue?.name?.trim() || "";
      const label = name
        ? `${code} — ${truncateText(name)}`
        : code;
      map.set(key, {
        value: key,
        label,
        title: name ? `${code} — ${name}` : code,
        sortKey: code,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey)
    );
  }, [candidates, programmeById]);

  const filteredData = React.useMemo(() => {
    const statusSet = new Set(statusFilters.map((s) => s.toUpperCase()));
    const programmeSet = new Set(programmeFilters);
    return candidates.filter((c) => {
      if (statusSet.size > 0) {
        const status = String(c.registration_status || "").toUpperCase();
        if (!statusSet.has(status)) return false;
      }
      if (typeFilter !== "all" && (c.registration_type || "") !== typeFilter) {
        return false;
      }
      if (programmeSet.size > 0) {
        const key = programmeKey(c);
        if (!key || !programmeSet.has(key)) return false;
      }
      if (genderFilter !== "all") {
        if (normalizeCandidateGender(c.gender) !== genderFilter) return false;
      }
      return true;
    });
  }, [candidates, statusFilters, typeFilter, programmeFilters, genderFilter]);

  const columns: ColumnDef<RegistrationCandidate>[] = React.useMemo(
    () => [
      {
        id: "name",
        accessorFn: (c) => candidateDisplayName(c),
        header: ({ column }) => <SortHeader label="Name" column={column} />,
        cell: ({ row }) => (
          <div className="font-medium">{candidateDisplayName(row.original)}</div>
        ),
      },
      {
        id: "registration_number",
        accessorFn: (c) => c.registration_number || "",
        header: ({ column }) => (
          <SortHeader label="Reg. number" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            {row.original.registration_number || "—"}
          </div>
        ),
      },
      {
        id: "index_number",
        accessorFn: (c) => c.index_number || "",
        header: ({ column }) => (
          <SortHeader label="Index number" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            {row.original.index_number || (
              <span className="italic text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "programme",
        accessorFn: (c) => c.programme_code || "",
        header: ({ column }) => (
          <FacetedHeaderFilter
            label="Programme"
            column={column}
            options={availableProgrammes}
            selected={programmeFilters}
            onChange={setProgrammeFilters}
          />
        ),
        cell: ({ row }) => {
          const c = row.original;
          const catalogue =
            c.programme_id != null
              ? programmeById.get(c.programme_id)
              : undefined;
          const code = catalogue?.code || c.programme_code || "—";
          const name = catalogue?.name?.trim();
          return (
            <div
              className="max-w-[14rem] text-sm"
              title={name ? `${code} — ${name}` : code !== "—" ? code : undefined}
            >
              <span className="font-medium">{code}</span>
              {name ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {name}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "type",
        accessorFn: (c) => c.registration_type || "",
        header: ({ column }) => <SortHeader label="Type" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm">
            {registrationTypeLabel(row.original.registration_type)}
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (c) =>
          String(c.registration_status || "").toUpperCase(),
        header: ({ column }) => (
          <FacetedHeaderFilter
            label="Status"
            column={column}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
        ),
        cell: ({ row }) => {
          const status = String(
            row.original.registration_status || ""
          ).toUpperCase();
          const label =
            status === "COMPLETE"
              ? "Complete"
              : status === "INCOMPLETE"
                ? "Incomplete"
                : status === "DRAFT"
                  ? "Draft"
                  : status || "—";
          return (
            <Badge
              className={cn("shadow-none", statusBadgeClass(status))}
            >
              {label}
            </Badge>
          );
        },
      },
      {
        id: "gender",
        accessorFn: (c) => genderLabel(c.gender),
        header: ({ column }) => <SortHeader label="Gender" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm">{genderLabel(row.original.gender)}</div>
        ),
      },
      {
        id: "registration_date",
        accessorFn: (c) => c.registration_date || "",
        header: ({ column }) => (
          <SortHeader label="Registered" column={column} />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.registration_date
              ? new Date(row.original.registration_date).toLocaleDateString()
              : "—"}
          </div>
        ),
      },
    ],
    [availableProgrammes, programmeById, programmeFilters, statusFilters]
  );

  const dataTable = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!query) return true;
      const c = row.original;
      const haystack = [
        candidateDisplayName(c),
        c.registration_number,
        c.index_number,
        c.programme_code,
        c.registration_type,
        registrationTypeLabel(c.registration_type),
        c.registration_status,
        c.gender,
        genderLabel(c.gender),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    },
    state: {
      sorting,
      columnVisibility,
      globalFilter,
      pagination,
    },
  });

  React.useEffect(() => {
    if (pagination.pageIndex === 0) return;
    handlePaginationChange({ pageIndex: 0, pageSize: pagination.pageSize });
    // Reset to first page when filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    globalFilter,
    statusFilters,
    typeFilter,
    programmeFilters,
    genderFilter,
  ]);

  const filteredRowModel = dataTable.getFilteredRowModel();
  const filteredRowIds = filteredRowModel.rows.map((r) => r.id).join(",");

  React.useEffect(() => {
    onFilteredChange?.(
      dataTable.getFilteredRowModel().rows.map((r) => r.original)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRowIds, onFilteredChange]);

  const filteredCount = filteredRowModel.rows.length;
  const totalCount = candidates.length;
  const pageCount = dataTable.getPageCount() || 1;
  const filtersActive =
    Boolean(globalFilter.trim()) ||
    statusFilters.length > 0 ||
    typeFilter !== "all" ||
    programmeFilters.length > 0 ||
    genderFilter !== "all";

  const clearFilters = () => {
    setGlobalFilter("");
    setStatusFilters([]);
    setTypeFilter("all");
    setProgrammeFilters([]);
    setGenderFilter("all");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, reg no, index, programme…"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 shadow-none"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {registrationTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[150px]">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unspecified">Unspecified</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shadow-none"
              onClick={clearFilters}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 shadow-none"
            >
              Columns <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {dataTable
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(!!value)
                  }
                >
                  {column.id.replace(/_/g, " ")}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <Table>
          <TableHeader>
            {dataTable.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {dataTable.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {totalCount === 0
                    ? "No candidates registered."
                    : "No candidates match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              dataTable.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row">
          <div>
            {filteredCount === 0
              ? "0 candidates"
              : `Showing ${
                  pagination.pageIndex * pagination.pageSize + 1
                }–${Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  filteredCount
                )} of ${filteredCount}${
                  filtersActive ? ` (filtered from ${totalCount})` : ""
                }`}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) =>
                handlePaginationChange({
                  pageIndex: 0,
                  pageSize: parseInt(v, 10),
                })
              }
            >
              <SelectTrigger className="h-8 w-[90px] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANDIDATE_TABLE_PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() => dataTable.previousPage()}
              disabled={!dataTable.getCanPreviousPage()}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="whitespace-nowrap px-1">
              {dataTable.getState().pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() => dataTable.nextPage()}
              disabled={!dataTable.getCanNextPage()}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
