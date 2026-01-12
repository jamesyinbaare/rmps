"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadSchedulesBulk, downloadScheduleTemplate } from "@/lib/api";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, XCircle, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExaminationScheduleBulkUploadResponse, ExaminationScheduleBulkUploadError } from "@/types";

interface BulkUploadSchedulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  onSuccess: () => void;
}

export function BulkUploadSchedulesDialog({
  open,
  onOpenChange,
  examId,
  onSuccess,
}: BulkUploadSchedulesDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ExaminationScheduleBulkUploadResponse | null>(null);

  const validateAndSetFile = (selectedFile: File) => {
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf("."));

    if (!validExtensions.includes(fileExtension)) {
      toast.error("Invalid file type. Please select an Excel (.xlsx, .xls) or CSV (.csv) file.");
      return;
    }

    setFile(selectedFile);
    setResult(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    validateAndSetFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    validateAndSetFile(droppedFile);
  };

  const handleDropZoneClick = () => {
    const fileInput = document.getElementById("schedule-file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadScheduleTemplate(examId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "schedule_upload_template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download template";
      toast.error(errorMessage);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await uploadSchedulesBulk(examId, file);
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully uploaded ${response.successful} schedule(s)`);
      }

      if (response.failed > 0) {
        toast.warning(`${response.failed} row(s) failed. Check details below.`);
      }

      if (response.failed === 0) {
        onSuccess();
        onOpenChange(false);
        setFile(null);
        setResult(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload schedules");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setFile(null);
      setResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Schedules</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with schedule data. The file should have columns: original_code, subject_name, examination_date, examination_time
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Download */}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleDownloadTemplate}
              variant="outline"
              size="sm"
              disabled={downloadingTemplate || loading}
            >
              {downloadingTemplate ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </>
              )}
            </Button>
          </div>

          {/* File Upload Area */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              File <span className="text-destructive">*</span>
            </label>
            <input
              id="schedule-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={loading}
              className="hidden"
            />
            <div
              onClick={handleDropZoneClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-green-500 bg-green-50 dark:bg-green-950"
                    : "border-gray-300 hover:border-gray-400"
                }
                ${loading ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-12 w-12 text-green-500" />
                  <div className="font-medium text-green-700 dark:text-green-400">{file.name}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    disabled={loading}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-12 w-12 text-gray-400" />
                  <div className="font-medium">Click to upload or drag and drop</div>
                  <div className="text-sm text-muted-foreground">Excel (.xlsx, .xls) or CSV (.csv) files only</div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Results */}
          {result && (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Upload Results</h3>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{result.successful} successful</span>
                  </div>
                  {result.failed > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>{result.failed} failed</span>
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Errors:</h4>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((error: ExaminationScheduleBulkUploadError, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono">{error.row_number}</TableCell>
                            <TableCell>{error.field || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <span className="text-sm">{error.error_message}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              {result && result.failed === 0 ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!file || loading}>
              {loading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
