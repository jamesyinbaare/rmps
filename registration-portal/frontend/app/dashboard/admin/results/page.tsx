"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listExams,
  listExamResults,
  publishExamResults,
  unpublishExamResults,
  uploadResultsBulk,
  publishResultsForExam,
  unpublishResultsForExam,
  listSchools,
  listAllSubjects,
} from "@/lib/api";
import type {
  RegistrationExam,
  CandidateResult,
  CandidateResultBulkPublish,
  Grade,
  School,
  Subject,
} from "@/types";
import { toast } from "sonner";
import { Upload, CheckCircle, XCircle, Eye, EyeOff, CheckSquare, Square } from "lucide-react";

export default function AdminResultsPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [selectedExam, setSelectedExam] = useState<RegistrationExam | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<number>>(new Set());
  const [loadingFilters, setLoadingFilters] = useState(false);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      loadResults();
      loadFilters();
      const exam = exams.find((e) => e.id === selectedExamId);
      setSelectedExam(exam || null);
    } else {
      setResults([]);
      setSelectedExam(null);
      setSelectedSchoolId(null);
      setSelectedSubjectId(null);
      setSelectedResultIds(new Set());
    }
  }, [selectedExamId, exams]);

  useEffect(() => {
    if (selectedExamId) {
      loadResults();
    }
  }, [selectedSchoolId, selectedSubjectId]);

  const loadExams = async () => {
    try {
      const examList = await listExams();
      setExams(examList);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    }
  };

  const loadFilters = async () => {
    if (!selectedExamId) return;
    setLoadingFilters(true);
    try {
      const schoolsList = await listSchools();
      setSchools(schoolsList);

      try {
        const subjectsResponse = await listAllSubjects();
        setSubjects(subjectsResponse);
      } catch (subjectsError) {
        console.error("Failed to load subjects:", subjectsError);
        setSubjects([]);
      }
    } catch (error) {
      toast.error("Failed to load filters");
      console.error(error);
    } finally {
      setLoadingFilters(false);
    }
  };

  const loadResults = async () => {
    if (!selectedExamId) return;

    setLoading(true);
    try {
      const resultList = await listExamResults(
        selectedExamId,
        undefined,
        selectedSubjectId || undefined,
        selectedSchoolId || undefined
      );
      setResults(resultList);
      // Clear selection when filters change
      setSelectedResultIds(new Set());
    } catch (error) {
      toast.error("Failed to load results");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishExam = async () => {
    if (!selectedExamId) return;

    try {
      await publishExamResults(selectedExamId);
      toast.success("Exam results published successfully");
      await loadExams();
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        setSelectedExam({ ...exam, results_published: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish exam");
    }
  };

  const handleUnpublishExam = async () => {
    if (!selectedExamId) return;

    try {
      await unpublishExamResults(selectedExamId);
      toast.success("Exam results unpublished successfully");
      await loadExams();
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        setSelectedExam({ ...exam, results_published: false });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unpublish exam");
    }
  };

  const handleBulkUpload = async () => {
    if (!selectedExamId || !bulkFile) {
      toast.error("Please select an Excel file");
      return;
    }

    setUploading(true);
    try {
      const response = await uploadResultsBulk(selectedExamId, bulkFile);
      if (response.failed > 0) {
        const errorMessages = response.errors.slice(0, 10).map(err =>
          `Row ${err.row}: ${err.error}`
        ).join('\n');
        const moreErrors = response.errors.length > 10 ? `\n... and ${response.errors.length - 10} more errors` : '';
        toast.error(
          `Uploaded ${response.successful} results. ${response.failed} failed.${moreErrors}`,
          { duration: 10000 }
        );
        console.error("Upload errors:", response.errors);
      } else {
        toast.success(`Successfully uploaded ${response.successful} results.`);
      }
      setUploadDialogOpen(false);
      setBulkFile(null);
      await loadResults();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload results");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setBulkFile(file);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedResultIds(new Set(results.map(r => r.id)));
    } else {
      setSelectedResultIds(new Set());
    }
  };

  const handleSelectResult = (resultId: number, checked: boolean) => {
    const newSelection = new Set(selectedResultIds);
    if (checked) {
      newSelection.add(resultId);
    } else {
      newSelection.delete(resultId);
    }
    setSelectedResultIds(newSelection);
  };

  const handlePublishSelected = async () => {
    if (!selectedExamId || selectedResultIds.size === 0) {
      toast.error("Please select results to publish");
      return;
    }

    try {
      const selectedResults = results.filter(r => selectedResultIds.has(r.id));

      // Get unique subject IDs from selected results
      const uniqueSubjectIds = new Set<number>();
      selectedResults.forEach(r => {
        uniqueSubjectIds.add(r.subject_id);
      });

      const response = await publishResultsForExam(
        selectedExamId,
        undefined, // We'll publish by subject only for now
        Array.from(uniqueSubjectIds)
      );

      toast.success(`Successfully published ${response.successful} results`);
      setSelectedResultIds(new Set());
      await loadResults();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish results");
    }
  };

  const handleUnpublishSelected = async () => {
    if (!selectedExamId || selectedResultIds.size === 0) {
      toast.error("Please select results to unpublish");
      return;
    }

    try {
      const selectedResults = results.filter(r => selectedResultIds.has(r.id));
      const uniqueSubjectIds = new Set<number>();

      selectedResults.forEach(r => {
        uniqueSubjectIds.add(r.subject_id);
      });

      const response = await unpublishResultsForExam(
        selectedExamId,
        undefined, // We'll need school IDs if available
        Array.from(uniqueSubjectIds)
      );

      toast.success(`Successfully unpublished ${response.successful} results`);
      setSelectedResultIds(new Set());
      await loadResults();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unpublish results");
    }
  };

  const getGradeBadge = (grade: Grade) => {
    const colorMap: Record<Grade, string> = {
      Fail: "destructive",
      Pass: "default",
      "Lower Credit": "secondary",
      Credit: "secondary",
      "Upper Credit": "default",
      Distinction: "default",
      Blocked: "destructive",
      Cancelled: "destructive",
      Absent: "secondary",
    };

    return (
      <Badge variant={colorMap[grade] as any} className="font-medium">
        {grade}
      </Badge>
    );
  };

  const allSelected = results.length > 0 && selectedResultIds.size === results.length;
  const someSelected = selectedResultIds.size > 0 && selectedResultIds.size < results.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results Management</h1>
        <p className="text-muted-foreground">Publish and manage examination results</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Examination</CardTitle>
          <CardDescription>Choose an examination to manage results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={selectedExamId?.toString() || ""}
              onValueChange={(value) => setSelectedExamId(parseInt(value))}
            >
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Select an examination" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} ({exam.exam_series} {exam.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedExam && (
              <div className="flex items-center gap-2">
                {selectedExam.results_published ? (
                  <>
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Published
                    </Badge>
                    <Button variant="outline" onClick={handleUnpublishExam}>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Unpublish
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">
                      <XCircle className="mr-1 h-3 w-3" />
                      Not Published
                    </Badge>
                    <Button onClick={handlePublishExam}>
                      <Eye className="mr-2 h-4 w-4" />
                      Publish Exam
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedExamId && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    View and manage results for the selected examination
                  </CardDescription>
                </div>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Results
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="school-filter">Filter by School</Label>
                  <Select
                    value={selectedSchoolId?.toString() || "all"}
                    onValueChange={(value) => setSelectedSchoolId(value === "all" ? null : parseInt(value))}
                  >
                    <SelectTrigger id="school-filter">
                      <SelectValue placeholder="All schools" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schools</SelectItem>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id.toString()}>
                          {school.code} - {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="subject-filter">Filter by Subject</Label>
                  <Select
                    value={selectedSubjectId?.toString() || "all"}
                    onValueChange={(value) => setSelectedSubjectId(value === "all" ? null : parseInt(value))}
                  >
                    <SelectTrigger id="subject-filter">
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subjects</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id.toString()}>
                          {subject.code} - {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(selectedSchoolId || selectedSubjectId) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedSchoolId(null);
                      setSelectedSubjectId(null);
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>

              {/* Selection Actions */}
              {selectedResultIds.size > 0 && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedResultIds.size} result{selectedResultIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    size="sm"
                    onClick={handlePublishSelected}
                    className="ml-auto"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Publish Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUnpublishSelected}
                  >
                    <EyeOff className="mr-2 h-4 w-4" />
                    Unpublish Selected
                  </Button>
                </div>
              )}

              {loading ? (
                <div className="text-center py-8">Loading results...</div>
              ) : results.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No results found. Use Upload Results to add results.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleSelectAll}
                            ref={(el) => {
                              if (el) {
                                (el as any).indeterminate = someSelected;
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Index Number</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedResultIds.has(result.id)}
                              onCheckedChange={(checked) => handleSelectResult(result.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {result.candidate_name}
                          </TableCell>
                          <TableCell>{result.candidate_index_number || "-"}</TableCell>
                          <TableCell>
                            {result.subject_code} - {result.subject_name}
                          </TableCell>
                          <TableCell>{getGradeBadge(result.grade)}</TableCell>
                          <TableCell>
                            {result.is_published ? (
                              <Badge variant="default" className="bg-green-500">
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload Results Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Results</DialogTitle>
            <DialogDescription>
              Upload an Excel file (.xlsx or .xls) with columns: registration_number, subject_code, grade, index_number (optional)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="results-file">Select Excel File</Label>
              <Input
                id="results-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {bulkFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {bulkFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setBulkFile(null);
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkUpload} disabled={!bulkFile || uploading}>
              {uploading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Results
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
