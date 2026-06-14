"use client";

import { ChevronDown, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { officialAccountsBtnPrimary, officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BankDirectoryUploadPanel({
  open,
  onOpenChange,
  file,
  onFileChange,
  busy,
  error,
  onSubmit,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className={cn(officialAccountsPanelClass, "overflow-hidden p-0")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 sm:px-5"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
            <Upload className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Upload branches</p>
            <p className="text-xs text-muted-foreground">Add new branches or update existing ones from a spreadsheet</p>
          </div>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-border/70 px-4 py-4 sm:px-5 sm:py-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              disabled={busy}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />

            <label
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center transition-colors",
                "hover:border-primary/40 hover:bg-muted/25 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <FileSpreadsheet className="size-8 text-muted-foreground/80" aria-hidden />
              <p className="mt-3 text-sm font-medium text-foreground">
                {file ? "Choose a different file" : "Choose a CSV or Excel file"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">.csv, .xlsx, or .xls — up to the server upload limit</p>
            </label>

            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={busy}
                  aria-label="Remove selected file"
                  onClick={() => {
                    onFileChange(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={cn(officialAccountsBtnPrimary, "gap-2")} disabled={busy || !file}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" aria-hidden />
                    Upload spreadsheet
                  </>
                )}
              </button>
              {!file ? (
                <p className="text-xs text-muted-foreground">Select a file to enable upload.</p>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
