"use client";

import { File, Image, FileText, Download, Trash2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/document";
import { formatFileSize, formatDate } from "@/lib/utils";

interface FileListItemProps {
  document: Document;
  onDownload?: (document: Document) => void;
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  schoolName?: string;
  subjectName?: string;
  isSelected?: boolean;
  onSelectionChange?: (id: number, selected: boolean) => void;
  bulkMode?: boolean;
}

export function FileListItem({
  document,
  onDownload,
  onSelect,
  onDelete,
  schoolName,
  subjectName,
  isSelected = false,
  onSelectionChange,
  bulkMode = false,
  size = "list",
}: FileListItemProps) {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return Image;
    }
    if (mimeType === "application/pdf") {
      return FileText;
    }
    return File;
  };

  const Icon = getFileIcon(document.mime_type);
  const isFailed = document.id_extraction_status === "error";

  const isLarge = size === "large-list";
  const paddingClass = isLarge ? "py-4" : "py-3";
  const iconSize = isLarge ? "h-12 w-12" : "h-10 w-10";
  const iconInnerSize = isLarge ? "h-6 w-6" : "h-5 w-5";
  const textSize = isLarge ? "text-base" : "text-sm";
  const metadataSize = isLarge ? "text-sm" : "text-xs";

  return (
    <div
      className={cn(
        "group flex items-center gap-4 border-b transition-colors cursor-pointer",
        paddingClass,
        isFailed
          ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
          : "border-border hover:bg-accent/50",
        isSelected && "bg-accent"
      )}
      onClick={(e) => {
        if (bulkMode && onSelectionChange) {
          // In bulk mode, clicking the row toggles selection
          onSelectionChange(document.id, !isSelected);
        } else {
          // Normal mode, open document
          onSelect?.(document);
        }
      }}
    >
      {/* Selection Checkbox */}
      {bulkMode && onSelectionChange && (
        <div
          className={cn("flex shrink-0 items-center justify-center", iconSize)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              onSelectionChange(document.id, checked === true);
            }}
            className="bg-background border-2"
          />
        </div>
      )}

      {/* File Icon */}
      {!bulkMode && (
        <div className={cn("flex shrink-0 items-center justify-center rounded bg-muted", iconSize)}>
          <Icon className={cn("text-muted-foreground", iconInnerSize)} />
        </div>
      )}

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("truncate font-medium", textSize)}>
            {document.extracted_id || document.file_name}
          </p>
          {isFailed && (
            <AlertCircle className={cn("text-destructive shrink-0", isLarge ? "h-4 w-4" : "h-3.5 w-3.5")} />
          )}
        </div>
        <p className={cn("text-muted-foreground", metadataSize)}>
          {formatFileSize(document.file_size)} • {formatDate(document.uploaded_at)}
        </p>
      </div>

      {/* Metadata */}
      <div className={cn("hidden shrink-0 text-left text-muted-foreground md:block", isLarge ? "min-w-[250px] text-sm" : "min-w-[200px] text-sm")}>
        <div className={cn("truncate", isLarge ? "min-w-[250px]" : "min-w-[200px]")} title={schoolName || "-"}>
          {schoolName ? (schoolName.length > (isLarge ? 40 : 35) ? `${schoolName.substring(0, isLarge ? 40 : 35)}...` : schoolName) : "-"}
        </div>
      </div>

      <div className={cn("hidden shrink-0 text-left text-muted-foreground md:block", isLarge ? "min-w-[250px] ml-10 text-sm" : "min-w-[200px] ml-10 text-sm")}>
        <div className={cn("truncate", isLarge ? "min-w-[250px]" : "min-w-[200px]")} title={subjectName || "-"}>
          {subjectName || "-"}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 flex gap-1">
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(document);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.(document);
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
