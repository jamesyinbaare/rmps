"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Programme } from "@/types/document";
import { GraduationCap } from "lucide-react";

interface ProgrammeListProps {
  programmes: Programme[];
  loading?: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  viewMode?: "grid" | "list";
  onSelect?: (programme: Programme) => void;
}

export function ProgrammeList({
  programmes,
  loading = false,
  currentPage,
  totalPages,
  onPageChange,
  viewMode = "grid",
  onSelect,
}: ProgrammeListProps) {
  if (loading) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-7">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-20 w-20 rounded mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="divide-y divide-border px-6 pt-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-3 w-[200px]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <GraduationCap className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No programmes found</p>
        <p className="text-sm text-muted-foreground">No programmes match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-7">
          {programmes.map((programme) => (
            <div
              key={programme.id}
              className="group relative flex flex-col rounded-lg border border-border bg-card transition-all hover:border-primary/50 hover:shadow-md aspect-square max-w-full cursor-pointer"
              onClick={() => onSelect?.(programme)}
            >
              <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
                <div className="w-full h-full flex items-center justify-center rounded bg-muted">
                  <GraduationCap className="h-16 w-16 text-muted-foreground" />
                </div>
              </div>
              <div className="w-full px-4 py-3 border-t border-border bg-card text-center">
                <p className="truncate text-sm font-medium mb-1">{programme.name}</p>
                <p className="text-xs text-muted-foreground">Code: {programme.code}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="hidden md:flex items-center gap-4 border-b border-border sticky top-0 bg-background z-10 px-6 pt-6 pb-3">
            <div className="w-10 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium">Name</div>
            </div>
            <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block max-w-[150px]">
              <div className="text-xs truncate min-w-[150px]">Code</div>
            </div>
            <div className="w-10 shrink-0" />
          </div>
          <div className="divide-y divide-border px-6">
            {programmes.map((programme) => (
              <div
                key={programme.id}
                className="group flex items-center gap-4 border-b border-border py-3 transition-colors hover:bg-accent/50 cursor-pointer"
                onClick={() => onSelect?.(programme)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{programme.name}</p>
                  <p className="text-xs text-muted-foreground">Created: {new Date(programme.created_at).toLocaleDateString()}</p>
                </div>
                <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block min-w-[150px]">
                  <div className="text-xs truncate min-w-[150px]">{programme.code}</div>
                </div>
                <div className="shrink-0 w-10" />
              </div>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
