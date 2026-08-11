"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { listExamResultSchools } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExamSchoolSummary } from "@/types/document";
import { Building2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

const PAGE_SIZE = 25;

interface ResultsSchoolsPanelProps {
  examId: number;
  onSelect: (school: ExamSchoolSummary) => void;
}

export function ResultsSchoolsPanel({ examId, onSelect }: ResultsSchoolsPanelProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [schools, setSchools] = useState<ExamSchoolSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gradedLoading, setGradedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300);
  const searchTerm = debouncedQuery.trim();

  useEffect(() => {
    setPage(1);
  }, [examId, searchTerm]);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    listExamResultSchools(examId, {
      page,
      page_size: PAGE_SIZE,
      search: searchTerm || undefined,
      include_counts: true,
      include_fully_graded: false,
    })
      .then((data) => {
        if (cancelled) return;
        setSchools(data.items);
        setTotal(data.total);
        setLoading(false);

        if (data.items.length === 0) {
          setGradedLoading(false);
          return;
        }

        setGradedLoading(true);
        return listExamResultSchools(examId, {
          page,
          page_size: PAGE_SIZE,
          search: searchTerm || undefined,
          include_counts: true,
          include_fully_graded: true,
        }).then((graded) => {
          if (cancelled) return;
          setSchools(graded.items);
          setTotal(graded.total);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSchools([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load schools");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setGradedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [examId, page, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searching = query.trim() !== searchTerm;
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-1 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Schools</h2>
          <p className="text-xs text-muted-foreground">
            {loading && schools.length === 0
              ? "Loading schools…"
              : `${total.toLocaleString()} school${total === 1 ? "" : "s"}${
                  searchTerm ? " matching your search" : " with registrations"
                } · click a row to open results`}
          </p>
        </div>
      </div>

      <div className="border-b bg-muted/20 px-5 py-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code, or region"
            className="h-9 bg-background pl-9"
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="px-5 py-10 text-center text-sm text-destructive">{error}</div>
      ) : loading && schools.length === 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/30">Code</TableHead>
              <TableHead className="bg-muted/30">School</TableHead>
              <TableHead className="bg-muted/30">Region</TableHead>
              <TableHead className="bg-muted/30 text-right">Candidates</TableHead>
              <TableHead className="bg-muted/30">Graded</TableHead>
              <TableHead className="w-16 bg-muted/30" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell>
                  <Skeleton className="h-4 w-14" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-10" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : schools.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {searchTerm ? "No schools match this search" : "No schools registered for this exam"}
          </p>
          {searchTerm && (
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/30">Code</TableHead>
              <TableHead className="bg-muted/30">School</TableHead>
              <TableHead className="bg-muted/30">Region</TableHead>
              <TableHead className="bg-muted/30 text-right">Candidates</TableHead>
              <TableHead className="bg-muted/30">Graded</TableHead>
              <TableHead className="w-16 bg-muted/30" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {schools.map((school) => {
              const pct =
                school.candidate_count > 0
                  ? Math.round((school.fully_graded_count / school.candidate_count) * 100)
                  : 0;
              return (
                <TableRow
                  key={school.school_id}
                  className="group cursor-pointer"
                  tabIndex={0}
                  onClick={() => onSelect(school)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(school);
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {school.school_code}
                  </TableCell>
                  <TableCell className="font-medium">{school.school_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {school.region || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {school.candidate_count.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {gradedLoading ? (
                      <Skeleton className="h-6 w-36" />
                    ) : (
                      <div className="w-36">
                        <div className="mb-1 flex items-baseline justify-between text-xs">
                          <span className="tabular-nums font-medium">
                            {school.fully_graded_count}/{school.candidate_count}
                          </span>
                          <span
                            className={cn(
                              "tabular-nums",
                              pct === 100 ? "text-emerald-700" : "text-muted-foreground"
                            )}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct === 100 ? "bg-emerald-500" : "bg-primary"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      View
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {searching ? "Updating…" : `${startIndex}–${endIndex} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
