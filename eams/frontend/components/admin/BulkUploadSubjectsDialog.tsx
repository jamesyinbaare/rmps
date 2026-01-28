"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadSubjectsBulk, downloadSubjectTemplate } from "@/lib/api";
import type { SubjectBulkUploadResponse, SubjectBulkUploadError } from "@/types";
import { toast } from "sonner";
import { Upload, FileText, Download, CheckCircle2, XCircle } from "lucide-react";

interface BulkUploadSubjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkUploadSubjectsDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkUploadSubjectsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<SubjectBulkUploadResponse | null>(null);

  const validateAndSetFile = (selectedFile: File) => {
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (!validExtensions.includes(ext)) {
      toast.error("Please select an Excel (.xlsx, .xls) or CSV (.csv) file.");
      return;
    }
    setFile(selectedFile);
    setResult(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadSubjectTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subject_upload_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download template");
    } finally {
      setDownloadingTemplate(false);
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
      const response = await uploadSubjectsBulk(file);
      setResult(response);
      if (response.successful > 0) {
        toast.success(`Uploaded ${response.successful} subject(s)`);
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
      toast.error(error instanceof Error ? error.message : "Failed to upload subjects");
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bulk upload subjects</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
            Close
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file with columns: <strong>code</strong>,{" "}
            <strong>name</strong>, and optionally <strong>type</strong>,{" "}
            <strong>description</strong>. Type must be one of: ELECTIVE, CORE,
            TECHNICAL_DRAWING_BUILDING_OPTION, TECHNICAL_DRAWING_MECHANICAL_OPTION,
            PRACTICAL.
          </p>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate || loading}
            >
              {downloadingTemplate ? (
                <Download className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download template
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">File</label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  disabled={loading}
                  className="text-sm file:mr-2 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm"
                />
                {file && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {file.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!file || loading}>
                {loading ? "Uploading..." : "Upload"}
              </Button>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </form>

          {result && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.successful} succeeded
                </span>
                {result.failed > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-4 w-4" />
                    {result.failed} failed
                  </span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium">Row</th>
                        <th className="p-2 text-left font-medium">Field</th>
                        <th className="p-2 text-left font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((err: SubjectBulkUploadError, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{err.row_number}</td>
                          <td className="p-2">{err.field ?? "—"}</td>
                          <td className="p-2 text-destructive">{err.error_message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
