"use client";

import { useEffect, useRef, useState } from "react";
import { File, FileText, Image as ImageIcon, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function isPdf(mimeType: string | null | undefined, fileName?: string | null) {
  return (
    mimeType === "application/pdf" || Boolean(fileName?.toLowerCase().endsWith(".pdf"))
  );
}

function isImage(mimeType: string | null | undefined) {
  return Boolean(mimeType?.startsWith("image/"));
}

export function ScoreSheetPreview({
  src,
  mimeType,
  fileName,
  alt,
  loading = false,
  error = false,
  emptyMessage = "No score sheet",
}: {
  src: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  alt?: string;
  loading?: boolean;
  error?: boolean;
  emptyMessage?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const label = alt || fileName || "Score sheet";
  const pdf = isPdf(mimeType, fileName);
  const image = !pdf && (isImage(mimeType) || Boolean(src && mimeType == null));

  useEffect(() => {
    setZoom(1);
    setImageLoading(true);
    setImageError(false);
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
      viewerRef.current.scrollLeft = 0;
    }
  }, [src]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!image) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.5, Math.round((z + delta) * 10) / 10)));
    }
  };

  const Icon = pdf ? FileText : image ? ImageIcon : File;
  const showError = error || imageError || (!loading && !src);
  const showImage = Boolean(src) && !loading && !showError && (image || (!pdf && Boolean(src)));
  const showPdf = Boolean(src) && !loading && !showError && pdf;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-muted/30">
      {showImage ? (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border bg-background/90 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => {
              setZoom(1);
              if (viewerRef.current) {
                viewerRef.current.scrollTop = 0;
                viewerRef.current.scrollLeft = 0;
              }
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Fit
          </Button>
        </div>
      ) : null}

      <div
        ref={viewerRef}
        className={`relative min-h-0 flex-1 overscroll-contain ${
          showImage && zoom > 1 ? "overflow-auto" : "overflow-hidden"
        }`}
        onWheel={handleWheel}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showError ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center p-8 text-center">
            <Icon className="mb-3 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : showImage && src ? (
          <>
            {imageLoading ? <Skeleton className="absolute inset-0 z-10 rounded-none" /> : null}
            {zoom <= 1 ? (
              <div className="absolute inset-0 flex items-center justify-center p-2">
                <img
                  src={src}
                  alt={label}
                  className="h-auto w-auto max-h-full max-w-full select-none rounded-sm bg-white object-contain shadow-sm"
                  style={{
                    transform: zoom < 1 ? `scale(${zoom})` : undefined,
                    transformOrigin: "center center",
                    opacity: imageLoading ? 0 : 1,
                    transition: "opacity 0.2s ease-in-out",
                  }}
                  draggable={false}
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                  }}
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center p-2"
                style={{
                  width: `${zoom * 100}%`,
                  height: `${zoom * 100}%`,
                  minWidth: "100%",
                  minHeight: "100%",
                }}
              >
                <img
                  src={src}
                  alt={label}
                  className="h-auto w-auto max-h-full max-w-full select-none rounded-sm bg-white object-contain shadow-sm"
                  style={{
                    opacity: imageLoading ? 0 : 1,
                    transition: "opacity 0.2s ease-in-out",
                  }}
                  draggable={false}
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                  }}
                />
              </div>
            )}
          </>
        ) : showPdf && src ? (
          <iframe src={src} title={label} className="absolute inset-0 h-full w-full border-0 bg-white" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <Icon className="mb-3 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const workspaceDialogClassName =
  "!fixed !inset-2 !top-2 !left-2 !right-2 !bottom-2 !translate-x-0 !translate-y-0 !w-auto !max-w-none !h-auto !max-h-none overflow-hidden flex flex-col p-0 gap-0 rounded-xl sm:!max-w-none";
