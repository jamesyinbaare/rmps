"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadCandidatesBulk, getAllExams } from "@/lib/api";
import type { Exam, CandidateBulkUploadResponse, CandidateBulkUploadError } from "@/types/document";
import { Upload, FileX, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface CandidateBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function CandidateBulkUpload({ open, onOpenChange, onUploadSuccess }: CandidateBulkUploadProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CandidateBulkUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load exams on mount
  useEffect(() => {
    async function loadExams() {
      try {
        let allExams: Exam[] = [];
        allExams = await getAllExams();

        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    }
    if (open) {
      loadExams();
    }
  }, [open]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setSelectedExamId("");
      setResult(null);
      setError(null);
      setUploading(false);
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf("."));

    if (!validExtensions.includes(fileExtension)) {
      setError(`Invalid file type. Please select an Excel (.xlsx, .xls) or CSV (.csv) file.`);
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    if (!selectedExamId) {
      setError("Please select an exam");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadCandidatesBulk(file, parseInt(selectedExamId));
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully uploaded ${response.successful} candidate(s)`);
      }

      if (response.failed > 0) {
        toast.warning(`${response.failed} row(s) failed. Check details below.`);
      }

      if (response.successful > 0 && onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload candidates";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const formatExamName = (exam: Exam) => {
    return `${exam.exam_type} - ${exam.series} ${exam.year}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Candidates</DialogTitle>
          <DialogDescription>
            Upload candidate information from an Excel or CSV file. The file should contain columns for school code,
            programme code (optional), name, index number, and subject codes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Exam Selection */}
          <div className="space-y-2">
            <label htmlFor="exam-select" className="text-sm font-medium">
              Exam <span className="text-destructive">*</span>
            </label>
            <Select value={selectedExamId} onValueChange={setSelectedExamId} disabled={uploading}>
              <SelectTrigger id="exam-select">
                <SelectValue placeholder="Select an exam" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {formatExamName(exam)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File Selection */}
          <div className="space-y-2">
            <label htmlFor="file-input" className="text-sm font-medium">
              File <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={uploading}
                className="flex-1"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileX className="h-4 w-4" />
                  <span className="truncate max-w-[200px]">{file.name}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Supported formats: Excel (.xlsx, .xls) or CSV (.csv)
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={!file || !selectedExamId || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Candidates
              </>
            )}
          </Button>

          {/* Results Display */}
          {result && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{result.total_rows}</div>
                  <div className="text-sm text-muted-foreground">Total Rows</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-5 w-5" />
                    {result.successful}
                  </div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                    <XCircle className="h-5 w-5" />
                    {result.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>

              {/* Error Details */}
              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Error Details:</h4>
                  <div className="max-h-60 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Row</th>
                          <th className="px-3 py-2 text-left font-medium">Field</th>
                          <th className="px-3 py-2 text-left font-medium">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((error: CandidateBulkUploadError, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{error.row_number}</td>
                            <td className="px-3 py-2">{error.field || "-"}</td>
                            <td className="px-3 py-2 text-red-600">{error.error_message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
