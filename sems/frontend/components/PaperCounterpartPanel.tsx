"use client";

import { Loader2 } from "lucide-react";
import type { Document, School, Subject } from "@/types/document";
import {
  DocumentComparePane,
  type CompareCardDocument,
  type DocumentCompareUpdateId,
} from "@/components/DocumentComparePane";

function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "ID extracted";
    case "error":
      return "ID error";
    case "pending":
      return "ID pending";
    default:
      return status;
  }
}

interface PaperCounterpartPanelProps {
  current: Document;
  counterpart: CompareCardDocument | null;
  loading?: boolean;
  schools: School[];
  subjects: Subject[];
  onDelete?: (documentId: number) => void;
  onUpdateId: DocumentCompareUpdateId;
  onCounterpartChanged?: () => void | Promise<void>;
}

export function PaperCounterpartPanel({
  current,
  counterpart,
  loading,
  schools,
  subjects,
  onDelete,
  onUpdateId,
  onCounterpartChanged,
}: PaperCounterpartPanelProps) {
  // Paper 1 (Objectives) on the left, Paper 2 (Essay) on the right.
  let paper1: CompareCardDocument | null = null;
  let paper2: CompareCardDocument | null = null;

  if (current.test_type === "1") {
    paper1 = current;
    paper2 = counterpart;
  } else if (current.test_type === "2") {
    paper2 = current;
    paper1 = counterpart;
  } else {
    paper1 = current;
    paper2 = counterpart;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {loading ? (
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="relative grid h-full min-h-0 grid-cols-2">
          <div className="h-full min-h-0 overflow-hidden border-r border-border">
            {paper1 ? (
              <DocumentComparePane
                doc={paper1}
                title="Paper 1 (Objectives)"
                tone="current"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave={paper1.id !== current.id}
                onSaved={
                  paper1.id !== current.id
                    ? () => void onCounterpartChanged?.()
                    : undefined
                }
                statusLabel={statusLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/20 px-8 text-center">
                <p className="text-sm font-medium">No Paper 1 (Objectives)</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No matching Objectives sheet for this school, subject, series, and page.
                </p>
              </div>
            )}
          </div>

          <div className="h-full min-h-0 overflow-hidden">
            {paper2 ? (
              <DocumentComparePane
                doc={paper2}
                title="Paper 2 (Essay)"
                tone="existing"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave={paper2.id !== current.id}
                onSaved={
                  paper2.id !== current.id
                    ? () => void onCounterpartChanged?.()
                    : undefined
                }
                statusLabel={statusLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/20 px-8 text-center">
                <p className="text-sm font-medium">No Paper 2 (Essay)</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No matching Essay sheet for this school, subject, series, and page.
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
