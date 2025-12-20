"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { uploadCandidatesBulk, getAllExams } from "@/lib/api";
import type { Exam, CandidateBulkUploadResponse, CandidateBulkUploadError, ExamType, ExamSeries } from "@/types/document";
import { Upload, FileX, CheckCircle2, XCircle, AlertCircle, ArrowLeft, FileText, X } from "lucide-react";
import { toast } from "sonner";

export default function UploadCandidatesPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examType, setExamType] = useState<ExamType | undefined>(undefined);
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>(undefined);
  const [examYear, setExamYear] = useState<number | undefined>(undefined);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CandidateBulkUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Load exams on mount
  useEffect(() => {
    async function loadExams() {
      try {
        setLoadingExams(true);
        const allExams = await getAllExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
        toast.error("Failed to load exams");
      } finally {
        setLoadingExams(false);
      }
    }
    loadExams();
  }, []);

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

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    // Check if all three filters are set and exam is selected
    if (!examType || !examSeries || !examYear) {
      setError("Please select exam type, series, and year to identify the examination");
      return;
    }

    if (!selectedExamId) {
      if (filteredExams.length === 0) {
        setError("No exam matches the selected filters. Please adjust your filters.");
      } else if (filteredExams.length > 1) {
        setError("Multiple exams found. Please ensure exam type, series, and year uniquely identify an exam.");
      } else {
        setError("Please select exam type, series, and year to identify the examination");
      }
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload candidates";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  // Get available exam series and years based on exam type
  const availableSeries = examType
    ? Array.from(new Set(exams.filter((e) => e.name === examType).map((e) => e.series as ExamSeries)))
    : Array.from(new Set(exams.map((e) => e.series as ExamSeries)));

  let filteredExamsForYears = exams;
  if (examType) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.name === examType);
  }
  if (examSeries) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.series === examSeries);
  }
  const availableYears = Array.from(new Set(filteredExamsForYears.map((e) => e.year)))
    .sort((a, b) => b - a);

  // Get filtered exams based on selections
  const filteredExams = exams.filter((exam) => {
    if (examType && exam.name !== examType) return false;
    if (examSeries && exam.series !== examSeries) return false;
    if (examYear && exam.year !== examYear) return false;
    return true;
  });

  // Auto-select exam when all three filters are set
  useEffect(() => {
    if (examType && examSeries && examYear) {
      if (filteredExams.length === 1) {
        setSelectedExamId(filteredExams[0].id.toString());
      } else {
        setSelectedExamId("");
      }
    } else {
      setSelectedExamId("");
    }
  }, [examType, examSeries, examYear, filteredExams]);

  const formatExamName = (exam: Exam) => {
    return `${exam.name} - ${exam.series} ${exam.year}`;
  };

  const handleReset = () => {
    setFile(null);
    setSelectedExamId("");
    setExamType(undefined);
    setExamSeries(undefined);
    setExamYear(undefined);
    setResult(null);
    setError(null);
    // Reset file input
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <DashboardLayout title="Upload Candidates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Upload Candidates" />
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
                        <li><strong>School Code</strong> (required) - The 6-character school code</li>
                        <li><strong>Programme Code</strong> (optional) - The programme code for the candidate</li>
                        <li><strong>Name</strong> (required) - Full name of the candidate</li>
                        <li><strong>Index Number</strong> (required) - Unique index number for the candidate</li>
                        <li><strong>Subject Codes</strong> (required) - One or more subject codes separated by commas or in separate columns</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Example Format</h4>
                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-2 text-left border-r">School Code</th>
                            <th className="px-3 py-2 text-left border-r">Programme Code</th>
                            <th className="px-3 py-2 text-left border-r">Name</th>
                            <th className="px-3 py-2 text-left border-r">Index Number</th>
                            <th className="px-3 py-2 text-left">Subject Codes</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-3 py-2 border-r font-mono">SCH001</td>
                            <td className="px-3 py-2 border-r font-mono">PROG01</td>
                            <td className="px-3 py-2 border-r">John Doe</td>
                            <td className="px-3 py-2 border-r font-mono">1234567890</td>
                            <td className="px-3 py-2">MATH,ENG,SCI</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 border-r font-mono">SCH001</td>
                            <td className="px-3 py-2 border-r font-mono">PROG01</td>
                            <td className="px-3 py-2 border-r">Jane Smith</td>
                            <td className="px-3 py-2 border-r font-mono">0987654321</td>
                            <td className="px-3 py-2">MATH,ENG</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Validation Rules</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>School code must be exactly 6 characters and must exist in the system</li>
                      <li>Programme code must exist in the system (if provided)</li>
                      <li>Index number must be unique for each candidate</li>
                      <li>Subject codes must be valid 3-character codes that exist in the system</li>
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
                  Select an exam and upload your candidate data file.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Exam Filter Selection */}
                <div className="space-y-4">
                  <div className="flex flex-col items-center space-y-4 max-w-2xl mx-auto">
                    {/* Exam Type */}
                    <div className="flex items-center gap-4 w-full">
                      <label className="text-sm font-medium w-32 text-right">Exam Type</label>
                      <Select
                        value={examType || "all"}
                        onValueChange={(value) => {
                          setExamType(value === "all" ? undefined : (value as ExamType));
                          setExamSeries(undefined);
                          setExamYear(undefined);
                          setSelectedExamId("");
                        }}
                        disabled={uploading || loadingExams}
                      >
                        <SelectTrigger className="flex-1 max-w-xs">
                          <SelectValue placeholder="All Exam Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Exam Types</SelectItem>
                          {Array.from(new Set(exams.map((e) => e.name as ExamType))).map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === "Certificate II Examination" ? "Certificate II" : type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Exam Series */}
                    <div className="flex items-center gap-4 w-full">
                      <label className="text-sm font-medium w-32 text-right">Series</label>
                      <Select
                        value={examSeries || "all"}
                        onValueChange={(value) => {
                          setExamSeries(value === "all" ? undefined : (value as ExamSeries));
                          setExamYear(undefined);
                          setSelectedExamId("");
                        }}
                        disabled={!examType || uploading || loadingExams}
                      >
                        <SelectTrigger className="flex-1 max-w-xs">
                          <SelectValue placeholder="All Series" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Series</SelectItem>
                          {availableSeries.map((series) => (
                            <SelectItem key={series} value={series}>
                              {series}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Exam Year */}
                    <div className="flex items-center gap-4 w-full">
                      <label className="text-sm font-medium w-32 text-right">Year</label>
                      <Select
                        value={examYear?.toString() || "all"}
                        onValueChange={(value) => {
                          setExamYear(value === "all" ? undefined : parseInt(value));
                          setSelectedExamId("");
                        }}
                        disabled={!examSeries || uploading || loadingExams}
                      >
                        <SelectTrigger className="flex-1 max-w-xs">
                          <SelectValue placeholder="All Years" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Years</SelectItem>
                          {availableYears.map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Show selected exam when all filters are set */}
                  {examType && examSeries && examYear && (
                    <>
                      {filteredExams.length === 1 ? (
                        <div className="p-3 bg-muted rounded-md text-sm text-center">
                          {formatExamName(filteredExams[0])}
                        </div>
                      ) : filteredExams.length === 0 ? (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                          No exam found matching the selected filters.
                        </div>
                      ) : (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                          Multiple exams found. Please ensure exam type, series, and year uniquely identify an exam.
                        </div>
                      )}
                    </>
                  )}
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
                    disabled={!file || !selectedExamId || !examType || !examSeries || !examYear || uploading}
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
                        Upload Candidates
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
