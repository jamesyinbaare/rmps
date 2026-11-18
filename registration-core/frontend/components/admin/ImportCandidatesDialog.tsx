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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadCandidatesImportTemplate, importCandidates } from "@/lib/api";
import type { BulkUploadResponse } from "@/types";
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

interface ImportCandidatesDialogProps {
  examId: number;
  examLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const REGISTRATION_TYPE_OPTIONS = [
  { value: "free_tvet", label: "Free TVET" },
  { value: "referral", label: "Referral" },
  { value: "private", label: "Private" },
] as const;

export function ImportCandidatesDialog({
  examId,
  examLabel,
  open,
  onOpenChange,
  onSuccess,
}: ImportCandidatesDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [defaultRegistrationType, setDefaultRegistrationType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase();
      if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
        toast.error("Please select a CSV or Excel file (.csv, .xlsx, .xls)");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadCandidatesImportTemplate(examId);
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
      const response = await importCandidates(
        examId,
        file,
        defaultRegistrationType || undefined
      );
      setResult(response);

      if (response.failed === 0) {
        toast.success(`Successfully imported ${response.successful} candidate(s)`);
        onSuccess();
        onOpenChange(false);
        setFile(null);
        setDefaultRegistrationType("");
        setResult(null);
      } else {
        toast.warning(
          `Import completed: ${response.successful} successful, ${response.failed} failed`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import candidates");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setFile(null);
      setDefaultRegistrationType("");
      setResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import candidates</DialogTitle>
          <DialogDescription>
            {examLabel ? `Import candidates for ${examLabel}. ` : ""}
            Upload a CSV or Excel file. Required: firstname, lastname (or name). Optional:
            othername, registration_number, index_number, school_code, programme_code,
            registration_type, subject_codes. When school_code is omitted, registration_number
            must be provided and unique. Subject selection is validated by candidate type
            (private, referral, free_tvet).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
            >
              {downloadingTemplate ? "Downloading..." : "Download template"}
              <Download className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_registration_type">Default registration type (when row omits it)</Label>
            <Select
              value={defaultRegistrationType || "none"}
              onValueChange={(v) => setDefaultRegistrationType(v === "none" ? "" : v)}
            >
              <SelectTrigger id="default_registration_type">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {REGISTRATION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-file">CSV or Excel file</Label>
            <div className="flex items-center gap-4">
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
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
                {loading ? "Importing..." : "Import"}
                <Upload className="ml-2 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
