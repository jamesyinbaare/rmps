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
import { bulkUploadSchools } from "@/lib/api";
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

interface BulkUploadSchoolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkUploadSchoolsDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkUploadSchoolsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    total_rows: number;
    successful: number;
    failed: number;
    errors: Array<{ row_number: number; error_message: string; field?: string | null }>;
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error("Please select a CSV file");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await bulkUploadSchools(file);
      setResult(response);

      if (response.failed === 0) {
        toast.success(`Successfully uploaded ${response.successful} schools`);
        onSuccess();
        onOpenChange(false);
        setFile(null);
        setResult(null);
      } else {
        toast.warning(
          `Uploaded ${response.successful} schools, ${response.failed} failed`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload schools");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Schools</DialogTitle>
          <DialogDescription>
            Upload a CSV file with school data. The file should have columns: code, name
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="file" className="text-sm font-medium">
              CSV File
            </label>
            <div className="flex items-center gap-4">
              <input
                id="file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={loading}
                className="flex-1 text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-[var(--primary)] file:text-[var(--primary-foreground)] hover:file:bg-[var(--primary-hover)]"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {file.name}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              CSV format: code (max 6 chars), name (max 255 chars)
            </p>
          </div>

          {result && (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                  <span className="font-semibold text-[var(--success)]">
                    {result.successful} successful
                  </span>
                </div>
                {result.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-[var(--destructive)]" />
                    <span className="font-semibold text-[var(--destructive)]">
                      {result.failed} failed
                    </span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-[var(--destructive)]" />
                    Errors:
                  </div>
                  <div className="rounded-md border max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((error, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{error.row_number}</TableCell>
                            <TableCell className="text-[var(--destructive)]">
                              {error.error_message}
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
