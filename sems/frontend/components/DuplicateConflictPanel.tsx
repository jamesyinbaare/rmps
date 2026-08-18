"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import type { Document, School, Subject } from "@/types/document";
import { formatDate } from "@/lib/utils";
import { getDocumentDownloadUrl } from "@/lib/api";
import { validateDocumentId } from "@/lib/document-id";
import { cn } from "@/lib/utils";

type ConflictCardDocument = Pick<
  Document,
  | "id"
  | "extracted_id"
  | "file_name"
  | "uploaded_at"
  | "id_extraction_status"
  | "mime_type"
  | "file_size"
>;

interface DuplicateConflictPanelProps {
  current: Document;
  conflicts: ConflictCardDocument[];
  loading?: boolean;
  schools: School[];
  subjects: Subject[];
  onDelete?: (documentId: number) => void;
  onUpdateId: (
    documentId: number,
    extractedId: string,
    schoolId?: number,
    subjectId?: number,
    options?: { advance?: boolean }
  ) => Promise<void>;
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

function DuplicateComparePane({
  doc,
  title,
  tone,
  schools,
  subjects,
  onDelete,
  onUpdateId,
  stayAfterSave,
  onSaved,
}: {
  doc: ConflictCardDocument;
  title: string;
  tone: "current" | "existing";
  schools: School[];
  subjects: Subject[];
  onDelete?: (documentId: number) => void;
  onUpdateId: DuplicateConflictPanelProps["onUpdateId"];
  stayAfterSave: boolean;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [manualId, setManualId] = useState(doc.extracted_id || "");
  const [idError, setIdError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    setManualId(doc.extracted_id || "");
    setEditing(false);
    setIdError(null);
    setImageError(false);
    setImageLoading(true);
  }, [doc.id, doc.extracted_id]);

  const isImage = (doc.mime_type || "").startsWith("image/");
  const FileIcon =
    doc.mime_type === "application/pdf" ? FileText : isImage ? ImageIcon : File;
  const unchanged = manualId.trim() === (doc.extracted_id || "");
  const previewUrl = getDocumentDownloadUrl(doc.id);

  const handleIdChange = (value: string) => {
    const limited = value.replace(/\D/g, "").slice(0, 13);
    setManualId(limited);
    if (limited.length === 13 && schools.length > 0 && subjects.length > 0) {
      setIdError(validateDocumentId(limited, schools, subjects).error);
    } else {
      setIdError(null);
    }
  };

  const handleSave = async () => {
    const validation = validateDocumentId(manualId, schools, subjects);
    if (validation.error) {
      setIdError(validation.error);
      return;
    }
    if (unchanged) return;

    setSaving(true);
    setIdError(null);
    try {
      await onUpdateId(
        doc.id,
        manualId.trim(),
        validation.schoolId,
        validation.subjectId,
        stayAfterSave ? { advance: false } : undefined
      );
      setEditing(false);
      onSaved?.();
    } catch (error) {
      setIdError(error instanceof Error ? error.message : "Failed to update document ID");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                tone === "current"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              )}
            >
              {title}
            </span>
            <Badge
              variant={doc.id_extraction_status === "error" ? "destructive" : "secondary"}
              className="h-5 px-1.5 text-[10px]"
            >
              {statusLabel(doc.id_extraction_status)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={doc.file_name}>
            #{doc.id} · {doc.file_name} · {formatDate(doc.uploaded_at)}
          </p>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-zinc-950">
        {isImage && imageLoading && !imageError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )}
        {!imageError && isImage ? (
          <div className="flex h-full items-center justify-center p-3">
            <img
              src={previewUrl}
              alt={doc.extracted_id || doc.file_name}
              className="max-h-full max-w-full object-contain"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center p-8 text-center text-zinc-400">
            <FileIcon className="mb-3 h-14 w-14" />
            <p className="text-sm">Preview not available for this file type</p>
            <p className="mt-1 text-xs">{doc.file_name}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        {editing ? (
          <div className="space-y-2">
            <Input
              type="text"
              inputMode="numeric"
              value={manualId}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder="Enter 13-digit document ID"
              maxLength={13}
              className="font-mono"
              aria-invalid={!!idError}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSave();
                }
              }}
            />
            {idError && <p className="text-xs text-destructive">{idError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void handleSave()}
                disabled={saving || !manualId.trim() || !!idError || unchanged}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save ID
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={saving}
                onClick={() => {
                  setManualId(doc.extracted_id || "");
                  setIdError(null);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
              {doc.extracted_id || "No ID"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => {
                setManualId(doc.extracted_id || "");
                setIdError(null);
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Change ID
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 shrink-0 gap-1.5"
                onClick={() => onDelete(doc.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
            <DuplicateComparePane
              doc={current}
              title="This upload"
              tone="current"
              schools={schools}
              subjects={subjects}
              onDelete={onDelete}
              onUpdateId={onUpdateId}
              stayAfterSave={false}
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
              <DuplicateComparePane
                doc={conflict}
                title="Already in the system"
                tone="existing"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave
                onSaved={() => void onConflictSideResolved?.()}
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
