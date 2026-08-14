"use client";

import { useState } from "react";
import { File, Image as ImageIcon, FileText, Download, Trash2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/document";
import { formatFileSize } from "@/lib/utils";
import { getDocumentThumbnailUrl } from "@/lib/api";
import { getIdExtractionErrorBadgeLabel } from "@/lib/id-extraction-errors";

interface FileGridProps {
  documents: Document[];
  onDownload?: (document: Document) => void;
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  selectedIds?: Set<number>;
  onSelectionChange?: (id: number, selected: boolean) => void;
  bulkMode?: boolean;
  enableSelection?: boolean;
  onRangeSelect?: (id: number) => void;
  focusedRowIndex?: number;
  size?: "grid" | "large-grid";
}

export function FileGrid({
  documents,
  onDownload,
  onSelect,
  onDelete,
  selectedIds = new Set(),
  onSelectionChange,
  bulkMode = false,
  enableSelection,
  onRangeSelect,
  focusedRowIndex = -1,
  size = "grid",
}: FileGridProps) {
  const selectionOn = enableSelection ?? bulkMode;
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

  // Grid sizing based on view mode
  // Normal grid: More columns (compact view)
  // Large grid: Fewer columns (larger cards)
  // At ~1196px: Large should have ~3 columns, Small should have ~4 columns (reduced from 5 for better image visibility)
  const gridClasses = size === "large-grid"
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 p-6"
    : "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-4 p-6";

  return (
    <div className={gridClasses}>
      {documents.map((doc, index) => {
        const Icon = getFileIcon(doc.mime_type);
        const fileType = getFileType(doc.mime_type, doc.file_name);
        const previewUrl = getDocumentThumbnailUrl(doc.id, size === "large-grid" ? 480 : 320);
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
            isSelected={selectedIds.has(doc.id)}
            onSelectionChange={onSelectionChange}
            onRangeSelect={onRangeSelect}
            enableSelection={selectionOn}
            focused={index === focusedRowIndex}
            size={size}
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
  isSelected = false,
  onSelectionChange,
  onRangeSelect,
  enableSelection = false,
  focused = false,
  size = "grid",
}: {
  doc: Document;
  previewUrl: string;
  displayText: string;
  fileType: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect?: (document: Document) => void;
  onDownload?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  isSelected?: boolean;
  onSelectionChange?: (id: number, selected: boolean) => void;
  onRangeSelect?: (id: number) => void;
  enableSelection?: boolean;
  focused?: boolean;
  size?: "grid" | "large-grid";
}) {
  const [imageError, setImageError] = useState(false);

  const isFailed = doc.id_extraction_status === "error";
  const isSuccess = doc.id_extraction_status === "success";
  const isPending = doc.id_extraction_status === "pending";
  const hasScores = doc.scores_extraction_status === "success";

  const getStatusBadge = () => {
    if (isFailed) {
      const label = getIdExtractionErrorBadgeLabel(doc.id_extraction_error_code);
      const badge = (
        <Badge variant="destructive" className="text-xs px-1.5 py-0">
          <AlertCircle className="h-3 w-3 mr-1" />
          {label}
        </Badge>
      );
      if (doc.id_extraction_error) {
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{badge}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>{doc.id_extraction_error}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return badge;
    }
    if (isPending) {
      return (
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }
    if (isSuccess) {
      return (
        <Badge variant="default" className="text-xs px-1.5 py-0 bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Extracted
        </Badge>
      );
    }
    return null;
  };

  const getScoresBadge = () => {
    if (hasScores) {
      return (
        <Badge variant="outline" className="text-xs px-1.5 py-0 border-blue-500 text-blue-600">
          Scores
        </Badge>
      );
    }
    return null;
  };

  return (
    <div
      id={`document-row-${doc.id}`}
      className={cn(
        "group relative flex flex-col rounded-lg border transition-all hover:shadow-lg aspect-square w-full cursor-pointer overflow-hidden",
        isSelected && "ring-2 ring-primary ring-offset-2",
        focused && "ring-2 ring-primary/40 ring-offset-2",
        isFailed
          ? "border-destructive/50 bg-destructive/5 hover:border-destructive"
          : "border-border bg-card hover:border-primary/50 hover:shadow-md"
      )}
      onClick={(e) => {
        if (e.shiftKey && onRangeSelect) {
          e.preventDefault();
          onRangeSelect(doc.id);
          return;
        }
        onSelect?.(doc);
      }}
    >
      {/* Selection Checkbox */}
      {enableSelection && onSelectionChange && (
        <div
          className={cn(
            "absolute z-20",
            size === "large-grid" ? "left-4 top-4" : "left-2 top-2"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey && onRangeSelect) {
              e.preventDefault();
              onRangeSelect(doc.id);
            }
          }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              onSelectionChange(doc.id, checked === true);
            }}
            className="bg-background border-2"
          />
        </div>
      )}

      {/* Image Preview / Icon Fallback */}
      <div className={cn(
        "flex-1 flex items-center justify-center bg-muted relative overflow-hidden",
        size === "large-grid"
          ? "p-3 sm:p-4 md:p-5 lg:p-4 xl:p-5"
          : "p-2 sm:p-3 md:p-3 lg:p-4"
      )}>
        {!imageError && doc.mime_type.startsWith("image/") ? (
          <img
            src={previewUrl}
            alt={displayText}
            className="max-w-full max-h-full object-contain"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center">
            <Icon className={cn(
              "text-muted-foreground",
              size === "large-grid" ? "h-20 w-20" : "h-12 w-12"
            )} />
          </div>
        )}
      </div>

      {/* Status Badges - Top Right (or below checkbox if bulk mode) */}
      <div className={cn(
        "absolute flex flex-col gap-1.5 z-10",
        enableSelection
          ? (size === "large-grid" ? "left-4 top-14" : "left-2 top-10")
          : (size === "large-grid" ? "left-4 top-4" : "left-2 top-2")
      )}>
        {getStatusBadge()}
        {getScoresBadge()}
      </div>

      {/* Card Footer - ID and Metadata */}
      <div className={cn(
        "w-full border-t border-border bg-card/95 backdrop-blur-sm text-center transition-colors shrink-0",
        size === "large-grid" ? "px-5 py-2.5" : "px-3 py-1.5"
      )}>
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <p className={cn(
            "truncate font-medium leading-tight",
            size === "large-grid" ? "text-base" : "text-xs"
          )}>{displayText}</p>
        </div>
        <div className="flex flex-col gap-0">
          <p className={cn(
            "text-muted-foreground leading-tight",
            size === "large-grid" ? "text-sm" : "text-[10px]"
          )}>
            {fileType} • {formatFileSize(doc.file_size)}
          </p>
          {isFailed && doc.id_extraction_error && (
            <p
              className={cn(
                "text-destructive truncate leading-tight",
                size === "large-grid" ? "text-sm" : "text-[10px]"
              )}
              title={doc.id_extraction_error}
            >
              {doc.id_extraction_error}
            </p>
          )}
          {doc.school_name && (
            <p className={cn(
              "text-muted-foreground truncate leading-tight",
              size === "large-grid" ? "text-sm" : "text-[10px]"
            )} title={doc.school_name}>
              {doc.school_name}
            </p>
          )}
        </div>
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
