"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import type { Document, School, Subject } from "@/types/document";
import {
  DocumentComparePane,
  type CompareCardDocument,
  type DocumentCompareUpdateId,
} from "@/components/DocumentComparePane";
import { cn } from "@/lib/utils";

interface DuplicateConflictPanelProps {
  current: Document;
  conflicts: CompareCardDocument[];
  loading?: boolean;
  schools: School[];
  subjects: Subject[];
  onDelete?: (documentId: number) => void;
  onUpdateId: DocumentCompareUpdateId;
  /** After conflict-side ID fix; parent may auto-retry when no conflicts remain. */
  onConflictSideResolved?: () => void | Promise<void>;
}

function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "ID extracted";
    case "error":
      return "Duplicate";
    case "pending":
      return "ID pending";
    default:
      return status;
  }
}

export function DuplicateConflictPanel({
  current,
  conflicts,
  loading,
  schools,
  subjects,
  onDelete,
  onUpdateId,
  onConflictSideResolved,
}: DuplicateConflictPanelProps) {
  const [conflictIndex, setConflictIndex] = useState(0);

  useEffect(() => {
    setConflictIndex(0);
  }, [current.id, conflicts.length]);

  useEffect(() => {
    if (conflictIndex >= conflicts.length && conflicts.length > 0) {
      setConflictIndex(conflicts.length - 1);
    }
  }, [conflictIndex, conflicts.length]);

  const conflict = conflicts[conflictIndex] ?? null;
  const hasMultipleConflicts = conflicts.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {loading ? (
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="relative grid h-full min-h-0 grid-cols-2">
          <div className="h-full min-h-0 overflow-hidden border-r border-border">
            <DocumentComparePane
              doc={current}
              title="This upload"
              tone="current"
              schools={schools}
              subjects={subjects}
              onDelete={onDelete}
              onUpdateId={onUpdateId}
              stayAfterSave={false}
              statusLabel={statusLabel}
            />
          </div>

          <div
            className={cn(
              "relative h-full min-h-0 overflow-hidden",
              hasMultipleConflicts && "pt-9"
            )}
          >
            {hasMultipleConflicts && (
              <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-xs tabular-nums text-muted-foreground">
                  Conflict {conflictIndex + 1} of {conflicts.length}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={conflictIndex <= 0}
                    onClick={() => setConflictIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous conflict"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={conflictIndex >= conflicts.length - 1}
                    onClick={() =>
                      setConflictIndex((i) => Math.min(conflicts.length - 1, i + 1))
                    }
                    aria-label="Next conflict"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {conflict ? (
              <DocumentComparePane
                doc={conflict}
                title="Already in the system"
                tone="existing"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave
                onSaved={() => void onConflictSideResolved?.()}
                statusLabel={statusLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/20 px-8 text-center">
                <p className="text-sm font-medium">No conflicting document</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Retry extraction or change this ID.
                </p>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute top-11 left-1/2 z-10 hidden -translate-x-1/2 md:block">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground shadow-sm">
              VS
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
