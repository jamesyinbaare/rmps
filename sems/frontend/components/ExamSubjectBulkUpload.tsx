"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadExamSubjectsBulk } from "@/lib/api";
import type { ExamSubjectBulkUploadResponse, ExamSubjectBulkUploadError } from "@/lib/api";
import { Upload, FileX, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExamSubjectBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  onUploadSuccess?: () => void;
}

export function ExamSubjectBulkUpload({
  open,
  onOpenChange,
  examId,
  onUploadSuccess,
}: ExamSubjectBulkUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExamSubjectBulkUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFile(null);
      setResult(null);
      setError(null);
      setUploading(false);
    }
    onOpenChange(newOpen);
  };

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

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadExamSubjectsBulk(examId, file);
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully updated ${response.successful} exam subject(s)`);
        onUploadSuccess?.();
      }

      if (response.failed > 0) {
        toast.warning(`${response.failed} row(s) failed. Check details below.`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload exam subjects";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Exam Subjects</DialogTitle>
          <DialogDescription>
            Upload exam subject data from an Excel or CSV file. The file should contain columns for
            original_code, subject_name, obj_pct, essay_pct, pract_pct, obj_max_score, and
            essay_max_score. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Selection */}
          <div className="space-y-2">
            <label htmlFor="file-input" className="text-sm font-medium">
              Select File <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-4">
              <Input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={uploading}
                className="cursor-pointer"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileX className="h-4 w-4" />
                  {file.name}
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Upload Button */}
          <div className="flex justify-end">
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>

          {/* Results Display */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Successful: {result.successful}</span>
                </div>
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span>Failed: {result.failed}</span>
                </div>
                <div className="text-muted-foreground">
                  Total: {result.total_rows}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Errors:</h4>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left">Row</th>
                          <th className="px-4 py-2 text-left">Original Code</th>
                          <th className="px-4 py-2 text-left">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((err: ExamSubjectBulkUploadError, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-4 py-2">{err.row_number}</td>
                            <td className="px-4 py-2">{err.original_code || "-"}</td>
                            <td className="px-4 py-2 text-red-600">{err.error_message}</td>
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
