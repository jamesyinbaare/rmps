"use client";

import { File, Image, FileText, Download } from "lucide-react";
import { Button } from "./ui/button";
import type { Document } from "@/types/document";
import { formatFileSize, formatDate } from "@/lib/utils";

interface FileListItemProps {
  document: Document;
  onDownload?: (document: Document) => void;
  onSelect?: (document: Document) => void;
}

export function FileListItem({ document, onDownload, onSelect }: FileListItemProps) {
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
      className="group flex items-center gap-4 border-b border-border px-6 py-3 transition-colors hover:bg-accent/50 cursor-pointer"
      onClick={() => onSelect?.(document)}
    >
      {/* File Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{document.file_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(document.file_size)} • {formatDate(document.uploaded_at)}
        </p>
      </div>

      {/* Metadata */}
      <div className="hidden shrink-0 text-right text-sm text-muted-foreground md:block">
        <div>{document.exam_id}</div>
        <div className="text-xs">{document.school_id || "-"}</div>
      </div>

      <div className="hidden shrink-0 text-right text-sm text-muted-foreground md:block">
        <div>{document.subject_id || "-"}</div>
      </div>

      {/* Actions */}
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
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
