"use client";

import { useState } from "react";
import { File, Image as ImageIcon, FileText, Download, Trash2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { Document } from "@/types/document";
import { formatFileSize } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";

interface FileGridProps {
  documents: Document[];
  onDownload?: (document: Document) => void;
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
}

export function FileGrid({ documents, onDownload, onSelect, onDelete }: FileGridProps) {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
    if (mimeType === "application/pdf") {
      return FileText;
    }
    return File;
  };

  const getFileType = (mimeType: string, fileName: string) => {
    if (mimeType.startsWith("image/")) {
      const ext = fileName.split(".").pop()?.toUpperCase();
      return ext || "IMAGE";
    }
    if (mimeType === "application/pdf") {
      return "PDF";
    }
    return "FILE";
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-7">
      {documents.map((doc) => {
        const Icon = getFileIcon(doc.mime_type);
        const fileType = getFileType(doc.mime_type, doc.file_name);
        const previewUrl = `${API_BASE_URL}/api/v1/documents/${doc.id}/download`;
        const displayText = doc.extracted_id || doc.file_name;

        return (
          <DocumentCard
            key={doc.id}
            doc={doc}
            previewUrl={previewUrl}
            displayText={displayText}
            fileType={fileType}
            Icon={Icon}
            onSelect={onSelect}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

function DocumentCard({
  doc,
  previewUrl,
  displayText,
  fileType,
  Icon,
  onSelect,
  onDownload,
  onDelete,
}: {
  doc: Document;
  previewUrl: string;
  displayText: string;
  fileType: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect?: (document: Document) => void;
  onDownload?: (document: Document) => void;
  onDelete?: (document: Document) => void;
}) {
  const [imageError, setImageError] = useState(false);

  const isFailed = doc.id_extraction_status === "error";

  return (
    <div
      className={`group relative flex flex-col rounded-lg border transition-all hover:shadow-md aspect-square max-w-full cursor-pointer ${
        isFailed
          ? "border-destructive/50 bg-destructive/5 hover:border-destructive"
          : "border-border bg-card hover:border-primary/50"
      }`}
      onClick={() => onSelect?.(doc)}
    >
      {/* Image Preview / Icon Fallback */}
      <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
        <div className="w-full h-full flex items-center justify-center rounded bg-muted overflow-hidden">
          {!imageError && doc.mime_type.startsWith("image/") ? (
            <img
              src={previewUrl}
              alt={displayText}
              className="max-w-full max-h-full object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <Icon className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Card Footer - ID and Metadata */}
      <div className="w-full px-4 py-3 border-t border-border bg-card text-center hover:bg-accent/50 transition-colors">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <p className="truncate text-sm font-medium">{displayText}</p>
          {doc.id_extraction_status === "error" && (
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" title="ID extraction failed" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {fileType} • {formatFileSize(doc.file_size)}
        </p>
      </div>

      {/* Hover Actions */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 flex gap-1">
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(doc);
            }}
            className="h-7 w-7"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.(doc);
          }}
          className="h-7 w-7"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
