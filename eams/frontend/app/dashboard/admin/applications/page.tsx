"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listAdminApplications,
  type AdminApplicationsSortField,
} from "@/lib/api";
import type {
  ExaminerApplicationResponse,
  ExaminerApplicationStatus,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText,
  Search,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: ExaminerApplicationStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
];

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
}: {
  label: string;
  sortKey: AdminApplicationsSortField;
  currentSort: { key: AdminApplicationsSortField; dir: SortDir } | null;
  onSort: (key: AdminApplicationsSortField) => void;
}) {
  const isActive = currentSort?.key === sortKey;
  const dir = isActive ? currentSort.dir : null;
  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
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

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<ExaminerApplicationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ExaminerApplicationStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [sort, setSort] = useState<{
    key: AdminApplicationsSortField;
    dir: SortDir;
  } | null>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = (pageOverride?: number) => {
    setLoading(true);
    const p = pageOverride ?? page;
    listAdminApplications({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      search: searchSubmitted.trim() || undefined,
      sort_by: sort?.key ?? undefined,
      order: sort?.dir ?? undefined,
      page: p,
      page_size: pageSize,
    })
      .then(setApplications)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load applications");
        setApplications([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter, page, sort?.key, sort?.dir, searchSubmitted]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchSubmitted(search);
  };

  const handleSort = (key: AdminApplicationsSortField) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" as SortDir };
      if (prev.dir === "asc") return { key, dir: "desc" as SortDir };
      return { key: "created_at", dir: "desc" as SortDir };
    });
    setPage(1);
  };

  const hasActiveFilters = searchSubmitted.trim() !== "" || statusFilter !== "ALL";
  const clearFilters = () => {
    setSearch("");
    setSearchSubmitted("");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Examiner Applications</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters & search
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <form onSubmit={handleSearch} className="flex gap-2 items-end flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                id="search"
                placeholder="Application #, name, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as ExaminerApplicationStatus | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={clearFilters}
            >
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Loading...</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader
                      label="Application #"
                      sortKey="application_number"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Name"
                      sortKey="full_name"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <TableHead>Subject</TableHead>
                    <SortableHeader
                      label="Status"
                      sortKey="status"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Submitted"
                      sortKey="submitted_at"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <TableHead>Recommendation</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {hasActiveFilters
                          ? "No applications match your search or filters."
                          : "No applications found."}
                        {hasActiveFilters && (
                          <span className="block text-xs mt-1">
                            Try clearing filters or changing search.
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    applications.map((app, index) => (
                      <TableRow
                        key={app.id}
                        className={cn(
                          "transition-colors hover:bg-muted/50",
                          index % 2 === 0 ? "bg-muted/30" : "bg-background"
                        )}
                      >
                        <TableCell className="font-medium">
                          {app.application_number}
                        </TableCell>
                        <TableCell>{app.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {app.subject
                            ? `${app.subject.code} – ${app.subject.name}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{app.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {app.submitted_at
                            ? new Date(app.submitted_at).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {app.recommendation_status?.completed
                            ? `Done${app.recommendation_status.recommender_name ? ` (${app.recommendation_status.recommender_name})` : ""}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="link" size="sm" asChild>
                            <Link href={`/dashboard/admin/applications/${app.id}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && applications.length === pageSize && (
            <div className="mt-4 flex justify-center gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {page}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
