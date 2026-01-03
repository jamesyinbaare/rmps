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
import { uploadProgrammesBulk, downloadProgrammeTemplate } from "@/lib/api";
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
import type { ProgrammeBulkUploadResponse, ProgrammeBulkUploadError } from "@/types";

interface BulkUploadProgrammesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkUploadProgrammesDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkUploadProgrammesDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ProgrammeBulkUploadResponse | null>(null);

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
    const fileInput = document.getElementById("programme-file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadProgrammeTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "programme_upload_template.xlsx";
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
      const response = await uploadProgrammesBulk(file);
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully uploaded ${response.successful} programme(s)`);
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
      toast.error(error instanceof Error ? error.message : "Failed to upload programmes");
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
          <DialogTitle>Bulk Upload Programmes</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with programme data. The file should have columns: Code, Name
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
              id="programme-file-input"
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
                relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
                }
                ${loading ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDropZoneClick();
                    }}
                    disabled={loading}
                  >
                    Change File
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {isDragging ? "Drop file here" : "Click to upload or drag and drop"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Excel (.xlsx, .xls) or CSV (.csv) files only
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Display */}
          {result && (
            <div className="space-y-4 border rounded-lg p-4">
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
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Errors:
                  </div>
                  <div className="rounded-md border max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((error: ProgrammeBulkUploadError, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{error.row_number}</TableCell>
                            <TableCell>{error.field || "-"}</TableCell>
                            <TableCell className="text-destructive">{error.error_message}</TableCell>
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
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button type="submit" disabled={loading || !file}>
                {loading ? "Uploading..." : "Upload"}
                <Upload className="ml-2 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
