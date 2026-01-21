"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileSearch } from "lucide-react";
import { compareSheetIds, getAllExams, getSchoolsForExam, getSubjectsForExamAndSchool } from "@/lib/api";
import type { Exam, SheetIdComparisonResponse, SheetIdInfo, School, Subject } from "@/types/document";
import Link from "next/link";

export default function SheetTrackingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const examIdParam = searchParams.get("exam_id");
  const defaultTab = searchParams.get("tab") || "missing";

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(
    examIdParam ? parseInt(examIdParam) : null
  );
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(
    searchParams.get("school_id") ? parseInt(searchParams.get("school_id")!) : null
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    searchParams.get("subject_id") ? parseInt(searchParams.get("subject_id")!) : null
  );
  const [selectedTestType, setSelectedTestType] = useState<number | null>(
    searchParams.get("test_type") ? parseInt(searchParams.get("test_type")!) : null
  );
  const [selectedSubjectType, setSelectedSubjectType] = useState<string | null>(
    searchParams.get("subject_type") || null
  );

  const [comparison, setComparison] = useState<SheetIdComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
        if (!selectedExamId && allExams.length > 0) {
          const newestExam = allExams.reduce((newest, current) => {
            const newestDate = new Date(newest.created_at);
            const currentDate = new Date(current.created_at);
            return currentDate > newestDate ? current : newest;
          });
          setSelectedExamId(newestExam.id);
        }
      } catch (error) {
        console.error("Error loading exams:", error);
      }
    };
    loadExams();
  }, []);

  // Load schools for selected exam
  useEffect(() => {
    const loadSchools = async () => {
      if (!selectedExamId) {
        setSchools([]);
        return;
      }
      try {
        const examSchools = await getSchoolsForExam(selectedExamId);
        setSchools(examSchools);
      } catch (error) {
        console.error("Error loading schools:", error);
        setSchools([]);
      }
    };
    loadSchools();
  }, [selectedExamId]);

  // Load subjects for selected exam and school
  useEffect(() => {
    const loadSubjects = async () => {
      if (!selectedExamId) {
        setSubjects([]);
        return;
      }
      try {
        const examSubjects = await getSubjectsForExamAndSchool(selectedExamId, selectedSchoolId || undefined);
        setSubjects(examSubjects);
      } catch (error) {
        console.error("Error loading subjects:", error);
        setSubjects([]);
      }
    };
    loadSubjects();
  }, [selectedExamId, selectedSchoolId]);

  // Load sheet ID comparison with filters
  useEffect(() => {
    const loadComparison = async () => {
      if (!selectedExamId) {
        setComparison(null);
        return;
      }

      setLoading(true);
      try {
        const result = await compareSheetIds(selectedExamId, {
          school_id: selectedSchoolId || undefined,
          subject_id: selectedSubjectId || undefined,
          test_type: selectedTestType || undefined,
        });
        setComparison(result);
      } catch (error) {
        console.error("Error loading sheet ID comparison:", error);
        setComparison(null);
      } finally {
        setLoading(false);
      }
    };

    loadComparison();
  }, [selectedExamId, selectedSchoolId, selectedSubjectId, selectedTestType]);

  // Update URL when filters or tab change
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", selectedExamId.toString());
    if (selectedSchoolId) params.set("school_id", selectedSchoolId.toString());
    if (selectedSubjectId) params.set("subject_id", selectedSubjectId.toString());
    if (selectedTestType) params.set("test_type", selectedTestType.toString());
    if (selectedSubjectType) params.set("subject_type", selectedSubjectType);
    if (activeTab !== "missing") params.set("tab", activeTab);

    router.replace(`/icm-studio/sheet-tracking?${params.toString()}`, { scroll: false });
  }, [selectedExamId, selectedSchoolId, selectedSubjectId, selectedTestType, selectedSubjectType, activeTab, router]);

  const formatExamLabel = (exam: Exam) => {
    return `${exam.exam_type} - ${exam.series} ${exam.year}`;
  };

  const getTestTypeLabel = (testType: number | null) => {
    if (testType === 1) return "Objectives";
    if (testType === 2) return "Essay";
    if (testType === 3) return "Practicals";
    return "Unknown";
  };

  const filterBySubjectType = (sheets: SheetIdInfo[]): SheetIdInfo[] => {
    if (!selectedSubjectType) return sheets;
    return sheets.filter((sheet) => {
      const subject = subjects.find((s) => s.id === sheet.subject_id);
      return subject?.subject_type === selectedSubjectType;
    });
  };

  const clearFilters = () => {
    setSelectedSchoolId(null);
    setSelectedSubjectId(null);
    setSelectedTestType(null);
    setSelectedSubjectType(null);
  };

  const missingSheets = comparison ? filterBySubjectType(comparison.missing_sheet_ids_info) : [];
  const uploadedSheets = comparison ? filterBySubjectType(comparison.uploaded_sheet_ids_info) : [];
  const expectedSheets = comparison ? filterBySubjectType(comparison.expected_sheet_ids_info) : [];
  const extraSheets = comparison ? filterBySubjectType(comparison.extra_sheet_ids_info) : [];

  return (
    <DashboardLayout title="Score Sheet Tracking">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Score Sheet Tracking Details" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/icm-studio">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Score Sheet Tracking Details</h1>
                  <p className="text-muted-foreground">
                    Detailed breakdown of expected vs uploaded score sheets
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Filter sheets by exam, school, subject, test type, and subject type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Examination</label>
                    <Select
                      value={selectedExamId?.toString() || ""}
                      onValueChange={(value) => setSelectedExamId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select examination" />
                      </SelectTrigger>
                      <SelectContent>
                        {exams.map((exam) => (
                          <SelectItem key={exam.id} value={exam.id.toString()}>
                            {formatExamLabel(exam)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">School</label>
                    <Select
                      value={selectedSchoolId?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSchoolId(null);
                        } else {
                          setSelectedSchoolId(parseInt(value));
                        }
                        setSelectedSubjectId(null);
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All schools" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All schools</SelectItem>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id.toString()}>
                            {school.name} ({school.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject</label>
                    <Select
                      value={selectedSubjectId?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSubjectId(null);
                        } else {
                          setSelectedSubjectId(parseInt(value));
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All subjects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All subjects</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id.toString()}>
                            {subject.name} ({subject.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject Type</label>
                    <Select
                      value={selectedSubjectType || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedSubjectType(null);
                        } else {
                          setSelectedSubjectType(value);
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="CORE">Core</SelectItem>
                        <SelectItem value="ELECTIVE">Elective</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Test Type</label>
                    <Select
                      value={selectedTestType?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setSelectedTestType(null);
                        } else {
                          setSelectedTestType(parseInt(value));
                        }
                      }}
                      disabled={!selectedExamId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="1">Objectives</SelectItem>
                        <SelectItem value="2">Essay</SelectItem>
                        <SelectItem value="3">Practicals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 flex items-end">
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="w-full"
                      disabled={!selectedSchoolId && !selectedSubjectId && !selectedTestType && !selectedSubjectType}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {!selectedExamId ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Please select an examination to view sheet tracking details</p>
                </CardContent>
              </Card>
            ) : loading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading comparison...</p>
                </CardContent>
              </Card>
            ) : comparison ? (
              <Card>
                <CardHeader>
                  <CardTitle>Sheet ID Details</CardTitle>
                  <CardDescription>
                    Detailed breakdown of expected vs uploaded score sheets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="missing">
                        Missing ({missingSheets.length})
                      </TabsTrigger>
                      <TabsTrigger value="uploaded">
                        Uploaded ({uploadedSheets.length})
                      </TabsTrigger>
                      <TabsTrigger value="expected">
                        Expected ({comparison.total_expected_sheets})
                      </TabsTrigger>
                      <TabsTrigger value="extra">
                        Extra ({extraSheets.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="missing" className="space-y-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sheet ID</TableHead>
                              <TableHead>Test Type</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead>Series</TableHead>
                              <TableHead>Sheet #</TableHead>
                              <TableHead>Candidates</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {missingSheets.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                  No missing sheets
                                </TableCell>
                              </TableRow>
                            ) : (
                              missingSheets.map((info) => (
                                <TableRow key={info.sheet_id}>
                                  <TableCell className="font-mono text-sm">{info.sheet_id}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {getTestTypeLabel(info.test_type)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.school_name || "—"}</div>
                                    {info.school_code && (
                                      <div className="text-xs text-muted-foreground">{info.school_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.subject_name || "—"}</div>
                                    {info.subject_code && (
                                      <div className="text-xs text-muted-foreground">{info.subject_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>{info.series || "—"}</TableCell>
                                  <TableCell>{info.sheet_number || "—"}</TableCell>
                                  <TableCell>{info.candidate_count || "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                    <TabsContent value="uploaded" className="space-y-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sheet ID</TableHead>
                              <TableHead>Test Type</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead>File Name</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {uploadedSheets.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  No uploaded sheets
                                </TableCell>
                              </TableRow>
                            ) : (
                              uploadedSheets.map((info) => (
                                <TableRow key={info.sheet_id}>
                                  <TableCell className="font-mono text-sm">{info.sheet_id}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {getTestTypeLabel(info.test_type)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.school_name || "—"}</div>
                                    {info.school_code && (
                                      <div className="text-xs text-muted-foreground">{info.school_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.subject_name || "—"}</div>
                                    {info.subject_code && (
                                      <div className="text-xs text-muted-foreground">{info.subject_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{info.file_name || "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                    <TabsContent value="expected" className="space-y-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sheet ID</TableHead>
                              <TableHead>Test Type</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead>Series</TableHead>
                              <TableHead>Sheet #</TableHead>
                              <TableHead>Candidates</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expectedSheets.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                  No expected sheets
                                </TableCell>
                              </TableRow>
                            ) : (
                              expectedSheets.slice(0, 100).map((info) => (
                                <TableRow key={info.sheet_id}>
                                  <TableCell className="font-mono text-sm">{info.sheet_id}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {getTestTypeLabel(info.test_type)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.school_name || "—"}</div>
                                    {info.school_code && (
                                      <div className="text-xs text-muted-foreground">{info.school_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.subject_name || "—"}</div>
                                    {info.subject_code && (
                                      <div className="text-xs text-muted-foreground">{info.subject_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>{info.series || "—"}</TableCell>
                                  <TableCell>{info.sheet_number || "—"}</TableCell>
                                  <TableCell>{info.candidate_count || "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                        {expectedSheets.length > 100 && (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            Showing first 100 of {expectedSheets.length} expected sheets
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="extra" className="space-y-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sheet ID</TableHead>
                              <TableHead>Test Type</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead>File Name</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {extraSheets.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  No extra sheets (all uploaded sheets match expected sheets)
                                </TableCell>
                              </TableRow>
                            ) : (
                              extraSheets.map((info) => (
                                <TableRow key={info.sheet_id}>
                                  <TableCell className="font-mono text-sm">{info.sheet_id}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {getTestTypeLabel(info.test_type)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.school_name || "—"}</div>
                                    {info.school_code && (
                                      <div className="text-xs text-muted-foreground">{info.school_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{info.subject_name || "—"}</div>
                                    {info.subject_code && (
                                      <div className="text-xs text-muted-foreground">{info.subject_code}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{info.file_name || "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No score sheets generated for this exam yet.</p>
                  <p className="text-sm mt-1">Generate score sheets to track document IDs.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
