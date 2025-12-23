"use client";

import { File, Image, FileText, Download, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import type { Document } from "@/types/document";
import { formatFileSize, formatDate } from "@/lib/utils";

interface FileListItemProps {
  document: Document;
  onDownload?: (document: Document) => void;
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  schoolName?: string;
  subjectName?: string;
}

export function FileListItem({
  document,
  onDownload,
  onSelect,
  onDelete,
  schoolName,
  subjectName,
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

  return (
    <div
      className="group flex items-center gap-4 border-b border-border py-3 transition-colors hover:bg-accent/50 cursor-pointer"
      onClick={() => onSelect?.(document)}
    >
      {/* File Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">
          {document.extracted_id || document.file_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(document.file_size)} • {formatDate(document.uploaded_at)}
        </p>
      </div>

      {/* Metadata */}
      <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block min-w-[200px]">
        <div className="text-xs truncate min-w-[200px]" title={schoolName || "-"}>
          {schoolName ? (schoolName.length > 35 ? `${schoolName.substring(0, 35)}...` : schoolName) : "-"}
        </div>
      </div>

      <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block min-w-[200px] ml-10">
        <div className="text-xs truncate min-w-[200px]" title={subjectName || "-"}>
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
