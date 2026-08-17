"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  confirmDocumentUploads,
  getAllExams,
  initiateDocumentUploads,
  putFileToUploadUrl,
} from "@/lib/api";
import type { Exam, UploadSlot } from "@/types/document";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileImage,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Images,
  Trash2,
} from "lucide-react";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
  /** Pre-select this examination when the dialog opens. */
  initialExamId?: number;
}

const BATCH_SIZE = 200;
const PUT_CONCURRENCY = 8;

type FailureRow = { file_name: string; error: string };

function skipReasonLabel(reason: string): string {
  switch (reason) {
    case "duplicate_checksum":
      return "already uploaded";
    case "duplicate_in_batch":
      return "duplicate in this selection";
    case "unsupported_mime_type":
      return "unsupported file type";
    case "file_too_large":
      return "file too large";
    default:
      return reason;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export function DocumentUpload({
  open,
  onOpenChange,
  onUploadSuccess,
  initialExamId,
}: DocumentUploadProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    initialExamId != null ? String(initialExamId) : ""
  );
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [alreadyUploaded, setAlreadyUploaded] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<{
    confirmed: number;
    failed: number;
    alreadyUploaded: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  useEffect(() => {
    if (!open) return;
    async function loadExams() {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    }
    loadExams();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setSelectedExamId(initialExamId != null ? String(initialExamId) : "");
      setUploading(false);
      setUploadProgress(0);
      setStatusLabel("");
      setError(null);
      setSuccess(null);
      setFailures([]);
      setAlreadyUploaded([]);
      setSummary(null);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (initialExamId != null) {
      setSelectedExamId(String(initialExamId));
    }
  }, [open, initialExamId]);

  const addFiles = (incoming: File[]) => {
    const validFiles = incoming.filter((file) => {
      return file.type === "image/jpeg" || file.type === "image/png";
    });
    if (validFiles.length !== incoming.length) {
      setError("Some files were skipped. Only JPEG and PNG images are allowed.");
    } else {
      setError(null);
    }
    if (validFiles.length === 0) return;
    setFiles((prev) => [...prev, ...validFiles]);
    setSuccess(null);
    setSummary(null);
    setFailures([]);
    setAlreadyUploaded([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadFailures = () => {
    if (failures.length === 0) return;
    const csv = [
      "file_name,error",
      ...failures.map(
        (f) => `"${f.file_name.replace(/"/g, '""')}","${f.error.replace(/"/g, '""')}"`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-upload-failures.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!selectedExamId) {
      setError("Please select an examination");
      return;
    }

    if (files.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setFailures([]);
    setAlreadyUploaded([]);
    setSummary(null);
    setUploadProgress(0);
    setStatusLabel("Preparing files…");

    const examId = parseInt(selectedExamId, 10);
    const allFailures: FailureRow[] = [];
    const alreadyUploadedNames: string[] = [];
    let confirmedCount = 0;
    let alreadyUploadedCount = 0;
    let failedCount = 0;

    try {
      const hashed: { file: File; checksum: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const checksum = await sha256Hex(file);
          hashed.push({ file, checksum });
        } catch (err) {
          failedCount += 1;
          allFailures.push({
            file_name: file.name,
            error: err instanceof Error ? err.message : "checksum_failed",
          });
        }
        setUploadProgress(Math.round(((i + 1) / files.length) * 20));
        setStatusLabel(`Checking file integrity… ${i + 1} of ${files.length}`);
      }

      const totalWaves = Math.max(1, Math.ceil(hashed.length / BATCH_SIZE));
      for (let wave = 0; wave < hashed.length; wave += BATCH_SIZE) {
        const waveIndex = Math.floor(wave / BATCH_SIZE) + 1;
        const batch = hashed.slice(wave, wave + BATCH_SIZE);
        setStatusLabel(`Reserving upload slots… batch ${waveIndex} of ${totalWaves}`);

        const initiate = await initiateDocumentUploads(
          examId,
          batch.map(({ file, checksum }) => ({
            file_name: file.name,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            checksum,
          }))
        );

        failedCount += initiate.failed;
        for (const skipped of initiate.skipped_files) {
          if (skipped.reason === "duplicate_checksum") {
            alreadyUploadedCount += 1;
            alreadyUploadedNames.push(skipped.file_name);
          } else {
            failedCount += 1;
            allFailures.push({
              file_name: skipped.file_name,
              error: skipReasonLabel(skipped.reason),
            });
          }
        }
        for (const failed of initiate.failed_files) {
          allFailures.push({ file_name: failed.file_name, error: failed.error });
        }

        const fileByChecksum = new Map(batch.map(({ file, checksum }) => [checksum, file]));
        const putTargets = initiate.uploads.filter((slot: UploadSlot) =>
          fileByChecksum.has(slot.checksum)
        );

        setStatusLabel(`Uploading to storage… batch ${waveIndex} of ${totalWaves}`);
        const putResults = await mapPool(putTargets, PUT_CONCURRENCY, async (slot) => {
          const file = fileByChecksum.get(slot.checksum);
          if (!file) {
            return { document_id: slot.document_id, ok: false as const, error: "file_missing" };
          }
          try {
            await putFileToUploadUrl(slot.upload_url, file, slot.headers);
            return { document_id: slot.document_id, ok: true as const };
          } catch (err) {
            return {
              document_id: slot.document_id,
              ok: false as const,
              error: err instanceof Error ? err.message : "put_failed",
              file_name: slot.file_name,
            };
          }
        });

        const succeededIds: number[] = [];
        for (const result of putResults) {
          if (result.ok) {
            succeededIds.push(result.document_id);
          } else {
            failedCount += 1;
            allFailures.push({
              file_name:
                "file_name" in result && result.file_name
                  ? result.file_name
                  : `document_${result.document_id}`,
              error: result.error,
            });
          }
        }

        if (succeededIds.length > 0) {
          setStatusLabel(`Confirming uploads… batch ${waveIndex} of ${totalWaves}`);
          const confirm = await confirmDocumentUploads(succeededIds);
          for (const item of confirm.results) {
            if (item.status === "confirmed" || item.status === "already_uploaded") {
              confirmedCount += 1;
            } else {
              failedCount += 1;
              allFailures.push({
                file_name: `document_${item.document_id}`,
                error: item.error || item.status,
              });
            }
          }
        }

        const progressBase = 20;
        const progressSpan = 80;
        setUploadProgress(
          Math.round(
            progressBase +
              (progressSpan * Math.min(wave + BATCH_SIZE, hashed.length)) /
                Math.max(hashed.length, 1)
          )
        );
      }

      setFailures(allFailures);
      setAlreadyUploaded(alreadyUploadedNames);
      setSummary({
        confirmed: confirmedCount,
        failed: failedCount,
        alreadyUploaded: alreadyUploadedCount,
      });
      setSuccess(
        failedCount === 0
          ? "Upload finished successfully."
          : "Upload finished with some issues."
      );
      setUploadProgress(100);
      setStatusLabel("Done");

      if (confirmedCount > 0) {
        setFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onUploadSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload files");
      setFailures(allFailures);
    } finally {
      setUploading(false);
    }
  };

  const canUpload = !uploading && files.length > 0 && !!selectedExamId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!uploading}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Images className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-xl">Upload documents</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Add JPEG or PNG exam sheets. Files upload directly to storage in large batches,
                then the system confirms each file before processing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="exam-select" className="text-sm font-medium">
              Examination
            </Label>
            <Select
              value={selectedExamId}
              onValueChange={setSelectedExamId}
              disabled={uploading}
            >
              <SelectTrigger id="exam-select" className="h-11 w-full">
                <SelectValue placeholder="Choose the examination these sheets belong to" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} · {exam.series} · {exam.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Files</Label>
              {files.length > 0 && !uploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  onClick={clearFiles}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Select files to upload"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!uploading) fileInputRef.current?.click();
                }
              }}
              className={cn(
                "group relative rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all outline-none",
                uploading
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px] shadow-primary/20"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!uploading) fileInputRef.current?.click();
              }}
            >
              <div
                className={cn(
                  "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
                  isDragging ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                )}
              >
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {isDragging ? "Drop images to add them" : "Drag and drop images here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or{" "}
                <span className="font-medium text-primary underline-offset-2 group-hover:underline">
                  browse files
                </span>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                JPEG and PNG · large folders supported · up to {formatBytes(50 * 1024 * 1024)} per
                file
              </p>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {files.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                    {files.length.toLocaleString()} file{files.length === 1 ? "" : "s"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(totalBytes)} total
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Showing {Math.min(files.length, 80).toLocaleString()}
                  {files.length > 80 ? ` of ${files.length.toLocaleString()}` : ""}
                </span>
              </div>
              <div className="max-h-52 divide-y overflow-y-auto">
                {files.slice(0, 80).map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
                      <FileImage className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    {!uploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFile(index)}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {files.length > 80 && (
                <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                  …and {(files.length - 80).toLocaleString()} more ready to upload
                </div>
              )}
            </div>
          )}

          {uploading && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Uploading
                </div>
                <span className="tabular-nums text-sm text-muted-foreground">
                  {uploadProgress}%
                </span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">{statusLabel}</p>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {summary && (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                {summary.failed === 0 ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{success}</p>
                  <p className="text-xs text-muted-foreground">
                    Confirmed files are queued for ID extraction.
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {summary.confirmed.toLocaleString()}
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Confirmed
                  </p>
                </div>
                <div className="rounded-lg bg-sky-500/10 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                    {summary.alreadyUploaded.toLocaleString()}
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Already there
                  </p>
                </div>
                <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-destructive">
                    {summary.failed.toLocaleString()}
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Failed
                  </p>
                </div>
              </div>

              {alreadyUploaded.length > 0 && (
                <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">
                    {alreadyUploaded.length.toLocaleString()} already uploaded
                  </summary>
                  <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-muted-foreground">
                    {alreadyUploaded.slice(0, 20).map((name, i) => (
                      <div key={`${name}-${i}`} className="truncate">
                        {name}
                      </div>
                    ))}
                    {alreadyUploaded.length > 20 && (
                      <div>…and {(alreadyUploaded.length - 20).toLocaleString()} more</div>
                    )}
                  </div>
                </details>
              )}

              {failures.length > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-destructive">
                      {failures.length.toLocaleString()} file(s) need attention
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={downloadFailures}
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                  </div>
                  <div className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {failures.slice(0, 12).map((f, i) => (
                      <div key={`${f.file_name}-${i}`} className="truncate">
                        <span className="font-medium text-foreground/80">{f.file_name}</span>
                        {" — "}
                        {f.error}
                      </div>
                    ))}
                    {failures.length > 12 && (
                      <div>…and {(failures.length - 12).toLocaleString()} more in the CSV</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4 sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block sm:max-w-[46%]">
            {files.length > 0
              ? `${files.length.toLocaleString()} ready · ${formatBytes(totalBytes)}`
              : "Select an examination, then add images to begin."}
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              {summary ? "Close" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!canUpload}
              className="min-w-40 gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload
                  {files.length > 0 ? ` ${files.length.toLocaleString()}` : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
