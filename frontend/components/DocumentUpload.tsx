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
import { uploadDocument, bulkUploadDocuments, listExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Upload, File } from "lucide-react";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function DocumentUpload({ open, onOpenChange, onUploadSuccess }: DocumentUploadProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load exams on mount
  useEffect(() => {
    async function loadExams() {
      try {
        // Fetch all exams by making multiple requests if needed
        let allExams: Exam[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const examsData = await listExams(page, 100);
          allExams = [...allExams, ...(examsData.items || [])];
          hasMore = page < examsData.total_pages;
          page++;
        }

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
    setUploadProgress(0);

    try {
      const examId = parseInt(selectedExamId, 10);

      if (files.length === 1) {
        // Single file upload
        await uploadDocument(files[0], examId);
        setSuccess(`Successfully uploaded ${files[0].name}`);
      } else {
        // Bulk upload
        const result = await bulkUploadDocuments(files, examId);
        setSuccess(
          `Upload complete: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped`
        );
      }

      setFiles([]);
      setSelectedExamId("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onUploadSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>Upload JPEG or PNG image files for document processing</DialogDescription>
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
                  {exam.name} ({exam.year})
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
            <p className="text-xs text-gray-500 mt-1">JPEG or PNG images only</p>
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
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-gray-500">
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
            </div>
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <Progress value={uploadProgress} />
            <p className="text-sm text-gray-600">Uploading files...</p>
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

          <Button onClick={handleUpload} disabled={uploading || files.length === 0 || !selectedExamId} className="w-full">
            {uploading ? "Uploading..." : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
