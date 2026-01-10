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
import { bulkUploadSchoolAdminUsers } from "@/lib/api";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BulkUploadResponse, BulkUploadError } from "@/types";

interface BulkUploadSchoolAdminUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkUploadSchoolAdminUsersDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkUploadSchoolAdminUsersDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);

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
    const fileInput = document.getElementById("school-admin-file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
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
      const response = await bulkUploadSchoolAdminUsers(file);
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully created ${response.successful} school admin user(s)`);
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
      toast.error(error instanceof Error ? error.message : "Failed to upload users");
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
          <DialogTitle>Bulk Upload School Admin Users</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with school admin user data. The file should have columns: Full_name, email_address, school_code, password
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Area */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              File <span className="text-destructive">*</span>
            </label>
            <input
              id="school-admin-file-input"
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
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-primary" />
                  <div className="text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setResult(null);
                    }}
                    disabled={loading}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div className="text-sm font-medium">
                    Click to upload or drag and drop
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Excel (.xlsx, .xls) or CSV (.csv) files only
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="text-sm font-medium">File Format Requirements:</div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Required columns: <strong>Full_name</strong>, <strong>email_address</strong>, <strong>school_code</strong>, <strong>password</strong></li>
              <li>Column names are case-insensitive and can have spaces (e.g., "Full name", "Email Address")</li>
              <li>Passwords must be at least 8 characters long</li>
              <li>Email addresses must be valid format</li>
              <li>School codes must exist in the system</li>
              <li>Each email address must be unique</li>
            </ul>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium">
                    Successful: {result.successful}
                  </span>
                </div>
                {result.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium">
                      Failed: {result.failed}
                    </span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border">
                  <div className="p-3 bg-muted border-b">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Errors ({result.errors.length})
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((error: BulkUploadError, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-xs">
                              {error.row_number}
                            </TableCell>
                            <TableCell className="text-sm">{error.error_message}</TableCell>
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
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
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
