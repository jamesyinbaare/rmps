"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  confirmDocumentUploads,
  getAllExams,
  initiateDocumentUploads,
  putFileToUploadUrl,
} from "@/lib/api";
import type { Exam, UploadSlot } from "@/types/document";
import { Upload, File } from "lucide-react";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

const BATCH_SIZE = 200;
const PUT_CONCURRENCY = 8;

type FailureRow = { file_name: string; error: string };

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

export function DocumentUpload({ open, onOpenChange, onUploadSuccess }: DocumentUploadProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadExams() {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    }
    loadExams();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter((file) => {
      const isValidType = file.type === "image/jpeg" || file.type === "image/png";
      if (!isValidType) {
        setError(`File ${file.name} is not a valid image type (JPEG/PNG required)`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...validFiles]);
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter((file) => {
      const isValidType = file.type === "image/jpeg" || file.type === "image/png";
      return isValidType;
    });
    if (validFiles.length !== droppedFiles.length) {
      setError("Some files were rejected. Only JPEG and PNG images are allowed.");
    }
    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadFailures = () => {
    if (failures.length === 0) return;
    const csv = ["file_name,error", ...failures.map((f) => `"${f.file_name.replace(/"/g, '""')}","${f.error.replace(/"/g, '""')}"`)].join("\n");
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
    setUploadProgress(0);
    setStatusLabel("Hashing files...");

    const examId = parseInt(selectedExamId, 10);
    const allFailures: FailureRow[] = [];
    let confirmedCount = 0;
    let skippedCount = 0;
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
        setStatusLabel(`Hashing files... ${i + 1}/${files.length}`);
      }

      const totalWaves = Math.max(1, Math.ceil(hashed.length / BATCH_SIZE));
      for (let wave = 0; wave < hashed.length; wave += BATCH_SIZE) {
        const waveIndex = Math.floor(wave / BATCH_SIZE) + 1;
        const batch = hashed.slice(wave, wave + BATCH_SIZE);
        setStatusLabel(`Initiating batch ${waveIndex}/${totalWaves}...`);

        const initiate = await initiateDocumentUploads(
          examId,
          batch.map(({ file, checksum }) => ({
            file_name: file.name,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            checksum,
          }))
        );

        skippedCount += initiate.skipped;
        failedCount += initiate.failed;
        for (const skipped of initiate.skipped_files) {
          allFailures.push({ file_name: skipped.file_name, error: skipped.reason });
        }
        for (const failed of initiate.failed_files) {
          allFailures.push({ file_name: failed.file_name, error: failed.error });
        }

        const fileByChecksum = new Map(batch.map(({ file, checksum }) => [checksum, file]));
        const putTargets = initiate.uploads.filter((slot: UploadSlot) =>
          fileByChecksum.has(slot.checksum)
        );

        setStatusLabel(`Uploading batch ${waveIndex}/${totalWaves}...`);
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
              file_name: "file_name" in result && result.file_name ? result.file_name : `document_${result.document_id}`,
              error: result.error,
            });
          }
        }

        if (succeededIds.length > 0) {
          setStatusLabel(`Confirming batch ${waveIndex}/${totalWaves}...`);
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
          Math.round(progressBase + (progressSpan * Math.min(wave + BATCH_SIZE, hashed.length)) / Math.max(hashed.length, 1))
        );
      }

      setFailures(allFailures);
      setSuccess(
        `Upload complete: ${confirmedCount} confirmed, ${failedCount} failed, ${skippedCount} skipped`
      );
      setUploadProgress(100);
      setStatusLabel("Done");

      if (confirmedCount > 0) {
        setFiles([]);
        setSelectedExamId("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onUploadSuccess?.();
        if (failedCount === 0 && skippedCount === 0) {
          onOpenChange(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload files");
      setFailures(allFailures);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload JPEG or PNG images. Files go directly to storage; the API only confirms after the object exists.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Examination *</label>
            <Select value={selectedExamId} onValueChange={setSelectedExamId} disabled={uploading}>
              <SelectTrigger>
                <SelectValue placeholder="Select an examination" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} ({exam.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Files</label>
            <div
              className="mt-2 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop files here, or click to select
              </p>
              <p className="text-xs text-gray-500 mt-1">JPEG or PNG images only — large batches supported</p>
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Selected files ({files.length}):</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {files.slice(0, 50).map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="h-4 w-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-gray-500 shrink-0">
                        ({(file.size / 1024).toFixed(2)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={uploading}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {files.length > 50 && (
                  <p className="text-xs text-gray-500 px-2">…and {files.length - 50} more</p>
                )}
              </div>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-gray-600">{statusLabel || "Uploading files..."}</p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {failures.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {failures.length} file(s) had issues.{" "}
                <button type="button" className="underline" onClick={downloadFailures}>
                  Download failure list
                </button>
              </p>
              <div className="max-h-24 overflow-y-auto text-xs text-muted-foreground space-y-1">
                {failures.slice(0, 10).map((f, i) => (
                  <div key={`${f.file_name}-${i}`}>
                    {f.file_name}: {f.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={uploading || files.length === 0 || !selectedExamId}
            className="w-full"
          >
            {uploading
              ? "Uploading..."
              : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
