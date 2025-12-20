"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { uploadSubjectsBulk, downloadSubjectTemplate } from "@/lib/api";
import type { SubjectBulkUploadResponse, SubjectBulkUploadError } from "@/types/document";
import { Upload, CheckCircle2, XCircle, AlertCircle, ArrowLeft, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export default function UploadSubjectsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<SubjectBulkUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const validateAndSetFile = (selectedFile: File) => {
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
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadSubjectTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subject_upload_template.xlsx";
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

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadSubjectsBulk(file);
      setResult(response);

      if (response.successful > 0) {
        toast.success(`Successfully uploaded ${response.successful} subject(s)`);
      }

      if (response.failed > 0) {
        toast.warning(`${response.failed} row(s) failed. Check details below.`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload subjects";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    // Reset file input
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <DashboardLayout title="Upload Subjects">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Upload Subjects" />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-6 space-y-6 max-w-4xl mx-auto">
            {/* File Format Instructions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <CardTitle>File Format Requirements</CardTitle>
                  </div>
                  <Button
                    onClick={() => router.back()}
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
                <CardDescription>
                  Please ensure your file follows the format described below before uploading.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Supported File Formats</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Excel files: .xlsx, .xls</li>
                      <li>CSV files: .csv</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Required Columns</h4>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>Your file must contain the following columns (in any order):</p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li><strong>Code</strong> (required) - Unique 3-character subject code</li>
                        <li><strong>Name</strong> (required) - Subject name</li>
                        <li><strong>Subject Type</strong> (required) - "CORE" or "ELECTIVE"</li>
                        <li><strong>Programme Code</strong> (optional) - Programme code to automatically associate this subject with</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Example Format</h4>
                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-2 text-left border-r">Code</th>
                            <th className="px-3 py-2 text-left border-r">Name</th>
                            <th className="px-3 py-2 text-left border-r">Subject Type</th>
                            <th className="px-3 py-2 text-left">Programme Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-3 py-2 border-r font-mono">MAT</td>
                            <td className="px-3 py-2 border-r">Mathematics</td>
                            <td className="px-3 py-2 border-r">CORE</td>
                            <td className="px-3 py-2 font-mono">PROG01</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 border-r font-mono">ENG</td>
                            <td className="px-3 py-2 border-r">English</td>
                            <td className="px-3 py-2 border-r">CORE</td>
                            <td className="px-3 py-2 font-mono">PROG01</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 border-r font-mono">SCI</td>
                            <td className="px-3 py-2 border-r">Science</td>
                            <td className="px-3 py-2 border-r">ELECTIVE</td>
                            <td className="px-3 py-2"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Validation Rules</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Code must be exactly 3 characters and unique (not already exist in the system)</li>
                      <li>Name is required</li>
                      <li>Subject type must be either "CORE" or "ELECTIVE"</li>
                      <li>Programme code (if provided) must exist in the system - the subject will be automatically associated with that programme</li>
                      <li>All required fields must be filled in</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Form */}
            <Card>
              <CardHeader>
                <CardTitle>Upload File</CardTitle>
                <CardDescription>
                  Download the template or upload your subject data file.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template Download Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleDownloadTemplate}
                    variant="outline"
                    disabled={downloadingTemplate || uploading}
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

                {/* File Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    File <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    disabled={uploading}
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
                      ${uploading ? "opacity-50 cursor-not-allowed" : ""}
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
                          disabled={uploading}
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

                {/* Error Display */}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-4 pt-2">
                  <Button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="flex-1"
                  >
                    {uploading ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Subjects
                      </>
                    )}
                  </Button>
                  {result && (
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      disabled={uploading}
                    >
                      Upload Another File
                    </Button>
                  )}
                </div>

                {/* Results Display */}
                {result && (
                  <div className="space-y-4 border-t pt-4 mt-4">
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
                              {result.errors.map((error: SubjectBulkUploadError, idx: number) => (
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
