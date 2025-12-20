"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CandidateDataTable } from "@/components/CandidateDataTable";
import { CandidateDetailDrawer } from "@/components/CandidateDetailDrawer";
import { CandidateDialog } from "@/components/CandidateDialog";
import {
  listCandidates,
  getSchoolById,
  getAllExams,
  listCandidateExamRegistrations,
  listProgrammes,
  listSchools,
  listSchoolProgrammes,
} from "@/lib/api";
import type { School, Candidate, Programme, Exam, ExamType, ExamSeries } from "@/types/document";
import { ArrowLeft, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SchoolCandidatesPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id ? parseInt(params.id as string) : null;

  const [school, setSchool] = useState<School | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [allProgrammes, setAllProgrammes] = useState<Programme[]>([]);
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [candidateExamMap, setCandidateExamMap] = useState<Map<number, Exam[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Candidate filter state
  const [examType, setExamType] = useState<ExamType | undefined>(undefined);
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>(undefined);
  const [examYear, setExamYear] = useState<number | undefined>(undefined);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Load school data
  useEffect(() => {
    const loadSchool = async () => {
      if (!schoolId) {
        setError("Invalid school ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const schoolData = await getSchoolById(schoolId);
        if (!schoolData) {
          setError("School not found");
          setLoading(false);
          return;
        }
        setSchool(schoolData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load school"
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchool();
  }, [schoolId]);

  // Load programmes for the school
  useEffect(() => {
    const loadProgrammes = async () => {
      if (!schoolId) return;

      try {
        const programmesData = await listSchoolProgrammes(schoolId);
        setProgrammes(programmesData);
      } catch (err) {
        console.error("Failed to load programmes:", err);
      }
    };

    loadProgrammes();
  }, [schoolId]);

  // Load all programmes for the form
  useEffect(() => {
    const loadAllProgrammes = async () => {
      try {
        const allProgrammesList: Programme[] = [];
        let programmePage = 1;
        let programmeHasMore = true;
        while (programmeHasMore) {
          const programmesData = await listProgrammes(programmePage, 100);
          allProgrammesList.push(...programmesData.items);
          programmeHasMore = programmePage < programmesData.total_pages;
          programmePage++;
        }
        setAllProgrammes(allProgrammesList);
      } catch (err) {
        console.error("Failed to load all programmes:", err);
      }
    };

    loadAllProgrammes();
  }, []);

  // Load all schools for the form
  useEffect(() => {
    const loadAllSchools = async () => {
      try {
        const allSchoolsList: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schools = await listSchools(schoolPage, 100);
          allSchoolsList.push(...schools);
          schoolHasMore = schools.length === 100;
          schoolPage++;
        }
        setAllSchools(allSchoolsList);
      } catch (err) {
        console.error("Failed to load all schools:", err);
      }
    };

    loadAllSchools();
  }, []);

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    };

    loadExams();
  }, []);

  // Load exam registrations for candidates
  const loadCandidateExamRegistrations = async (candidateIds: number[]) => {
    try {
      const examMap = new Map<number, Exam[]>();

      await Promise.all(
        candidateIds.map(async (candidateId) => {
          try {
            const examRegs = await listCandidateExamRegistrations(candidateId);
            const candidateExams = examRegs
              .map((reg) => exams.find((e) => e.id === reg.exam_id))
              .filter((e): e is Exam => e !== undefined);
            examMap.set(candidateId, candidateExams);
          } catch (err) {
            console.error(`Failed to load exam registrations for candidate ${candidateId}:`, err);
            examMap.set(candidateId, []);
          }
        })
      );

      setCandidateExamMap(examMap);
    } catch (err) {
      console.error("Failed to load candidate exam registrations:", err);
    }
  };

  // Fetch candidates with filters
  const handleFetchCandidates = async () => {
    if (!schoolId) return;

    setCandidatesLoading(true);
    try {
      // Fetch all candidates for the school
      let allCandidates: Candidate[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await listCandidates(page, 100, schoolId);
        allCandidates.push(...response.items);
        hasMore = page < response.total_pages;
        page++;
      }

      // Load exam registrations for all candidates
      await loadCandidateExamRegistrations(allCandidates.map((c) => c.id));

      setCandidates(allCandidates);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load candidates");
      console.error("Failed to load candidates:", err);
    } finally {
      setCandidatesLoading(false);
    }
  };

  // Get available exam series and years based on exam type
  const availableSeries = examType
    ? Array.from(new Set(exams.filter((e) => e.exam_type === examType).map((e) => e.series as ExamSeries)))
    : Array.from(new Set(exams.map((e) => e.series as ExamSeries)));

  let filteredExamsForYears = exams;
  if (examType) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.exam_type === examType);
  }
  if (examSeries) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.series === examSeries);
  }
  const availableYears = Array.from(new Set(filteredExamsForYears.map((e) => e.year)))
    .sort((a, b) => b - a);

  // Filter candidates based on selected filters
  const filteredCandidates = candidates.filter((candidate) => {
    // Filter by programme
    if (selectedProgrammeId !== undefined) {
      if (candidate.programme_id !== selectedProgrammeId) {
        return false;
      }
    }

    // Filter by exam type, series, year
    if (examType || examSeries || examYear) {
      const candidateExams = candidateExamMap.get(candidate.id) || [];
      let matches = false;

      for (const exam of candidateExams) {
        let examMatches = true;

        if (examType && exam.exam_type !== examType) {
          examMatches = false;
        }
        if (examSeries && exam.series !== examSeries) {
          examMatches = false;
        }
        if (examYear && exam.year !== examYear) {
          examMatches = false;
        }

        if (examMatches) {
          matches = true;
          break;
        }
      }

      if (!matches) {
        return false;
      }
    }

    return true;
  });

  if (loading) {
    return (
      <DashboardLayout title="School Candidates">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !school) {
    return (
      <DashboardLayout title="School Candidates">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
            {error || "School not found"}
          </div>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/schools")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Schools
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="School Candidates">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/schools/${schoolId}`)}
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">{school.name} - Candidates</h1>
                <p className="text-sm text-muted-foreground">Code: {school.code}</p>
              </div>
            </div>
            <CandidateDialog
              schools={allSchools}
              programmes={allProgrammes}
              schoolId={schoolId || undefined}
              onSuccess={handleFetchCandidates}
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Filters */}
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
                    }}
                  >
                    <SelectTrigger className="flex-1 max-w-xs">
                      <SelectValue placeholder="All Exam Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Exam Types</SelectItem>
                      {Array.from(new Set(exams.map((e) => e.exam_type as ExamType))).map((type) => (
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
                    }}
                    disabled={!examType}
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
                    }}
                    disabled={!examSeries}
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

                {/* Programme */}
                <div className="flex items-center gap-4 w-full">
                  <label className="text-sm font-medium w-32 text-right">Programme</label>
                  <Select
                    value={selectedProgrammeId?.toString() || "all"}
                    onValueChange={(value) => {
                      setSelectedProgrammeId(value === "all" ? undefined : parseInt(value));
                    }}
                  >
                    <SelectTrigger className="flex-1 max-w-xs">
                      <SelectValue placeholder="All Programmes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Programmes</SelectItem>
                      {programmes.map((programme) => (
                        <SelectItem key={programme.id} value={programme.id.toString()}>
                          {programme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 w-full">
                  <div className="w-32"></div>
                  <div className="flex-1 max-w-xs flex gap-2">
                    {(examType || examSeries || examYear || selectedProgrammeId) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setExamType(undefined);
                          setExamSeries(undefined);
                          setExamYear(undefined);
                          setSelectedProgrammeId(undefined);
                          setSearchQuery("");
                        }}
                        className="flex-1"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}
                    <Button
                      onClick={handleFetchCandidates}
                      disabled={candidatesLoading}
                      className="flex-1"
                    >
                      {candidatesLoading ? "Loading..." : "Fetch Candidates"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Table */}
            <CandidateDataTable
              candidates={filteredCandidates}
              loading={candidatesLoading}
              onSelect={(candidate) => {
                setSelectedCandidate(candidate);
                setDrawerOpen(true);
              }}
            />
          </div>
        </div>

        {/* Candidate Detail Drawer */}
        <CandidateDetailDrawer
          candidate={selectedCandidate}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </DashboardLayout>
  );
}
