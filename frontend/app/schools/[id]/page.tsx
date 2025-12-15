"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CandidateDataTable } from "@/components/CandidateDataTable";
import { ProgrammeDataTable } from "@/components/ProgrammeDataTable";
import { CandidateDetailDrawer } from "@/components/CandidateDetailDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCandidates,
  listSchoolProgrammes,
  removeProgrammeFromSchool,
  getSchoolById,
  listExams,
  listCandidateExamRegistrations,
} from "@/lib/api";
import type { School, Candidate, Programme, Exam, ExamRegistration } from "@/types/document";
import { Building2, ArrowLeft, Search, X } from "lucide-react";
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

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id ? parseInt(params.id as string) : null;

  const [school, setSchool] = useState<School | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [candidateExamMap, setCandidateExamMap] = useState<Map<number, number[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [programmesLoading, setProgrammesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filter and search state
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(undefined);
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

  // Load candidates
  useEffect(() => {
    const loadCandidates = async () => {
      if (!schoolId) return;

      setCandidatesLoading(true);
      try {
        let allCandidates: Candidate[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await listCandidates(page, 100, schoolId);
          allCandidates.push(...response.items);
          hasMore = page < response.total_pages;
          page++;
        }

        setCandidates(allCandidates);
      } catch (err) {
        console.error("Failed to load candidates:", err);
      } finally {
        setCandidatesLoading(false);
      }
    };

    loadCandidates();
  }, [schoolId]);

  // Load programmes
  useEffect(() => {
    const loadProgrammes = async () => {
      if (!schoolId) return;

      setProgrammesLoading(true);
      try {
        const programmesData = await listSchoolProgrammes(schoolId);
        setProgrammes(programmesData);
      } catch (err) {
        console.error("Failed to load programmes:", err);
      } finally {
        setProgrammesLoading(false);
      }
    };

    loadProgrammes();
  }, [schoolId]);

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        let allExams: Exam[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const examsData = await listExams(page, 100);
          allExams.push(...examsData.items);
          hasMore = page < examsData.total_pages;
          page++;
        }

        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    };

    loadExams();
  }, []);

  // Load exam registrations for all candidates to build the map
  useEffect(() => {
    const loadCandidateExamRegistrations = async () => {
      if (candidates.length === 0) return;

      try {
        const examMap = new Map<number, number[]>();

        // Load exam registrations for each candidate
        await Promise.all(
          candidates.map(async (candidate) => {
            try {
              const examRegs = await listCandidateExamRegistrations(candidate.id);
              const examIds = examRegs.map((reg) => reg.exam_id);
              examMap.set(candidate.id, examIds);
            } catch (err) {
              console.error(`Failed to load exam registrations for candidate ${candidate.id}:`, err);
              examMap.set(candidate.id, []);
            }
          })
        );

        setCandidateExamMap(examMap);
      } catch (err) {
        console.error("Failed to load candidate exam registrations:", err);
      }
    };

    loadCandidateExamRegistrations();
  }, [candidates]);

  const handleRemoveProgramme = async (programmeId: number) => {
    if (!schoolId) return;

    try {
      await removeProgrammeFromSchool(schoolId, programmeId);
      // Reload programmes after removal
      const programmesData = await listSchoolProgrammes(schoolId);
      setProgrammes(programmesData);
    } catch (error) {
      throw error; // Let the component handle the error
    }
  };

  // Filter candidates based on selected filters and search
  const filteredCandidates = candidates.filter((candidate) => {
    // Filter by programme
    if (selectedProgrammeId !== undefined) {
      if (candidate.programme_id !== selectedProgrammeId) {
        return false;
      }
    }

    // Filter by exam
    if (selectedExamId !== undefined) {
      const candidateExamIds = candidateExamMap.get(candidate.id) || [];
      if (!candidateExamIds.includes(selectedExamId)) {
        return false;
      }
    }

    // Search by index number (on already filtered candidates)
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      if (!candidate.index_number.toLowerCase().includes(query)) {
        return false;
      }
    }

    return true;
  });

  if (loading) {
    return (
      <DashboardLayout title="School Details">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !school) {
    return (
      <DashboardLayout title="School Details">
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
    <DashboardLayout title="School Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/schools")}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">{school.name}</h1>
              <p className="text-sm text-muted-foreground">Code: {school.code}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="candidates" className="w-4/5 mx-auto">
            <TabsList>
              <TabsTrigger value="candidates">Candidates</TabsTrigger>
              <TabsTrigger value="programmes">Programmes</TabsTrigger>
            </TabsList>

            <TabsContent value="candidates" className="mt-4">
              {/* Filters and Search */}
              <div className="mb-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Filter by Examination */}
                  <Select
                    value={selectedExamId?.toString() || "all"}
                    onValueChange={(value) =>
                      setSelectedExamId(value === "all" ? undefined : parseInt(value))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All Examinations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Examinations</SelectItem>
                      {exams.map((exam) => (
                        <SelectItem key={exam.id} value={exam.id.toString()}>
                          {exam.name} ({exam.year})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filter by Programme */}
                  <Select
                    value={selectedProgrammeId?.toString() || "all"}
                    onValueChange={(value) =>
                      setSelectedProgrammeId(value === "all" ? undefined : parseInt(value))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
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

                  {/* Search by Index Number */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search by index number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setSearchQuery("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(selectedExamId !== undefined || selectedProgrammeId !== undefined || searchQuery) && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedExamId(undefined);
                        setSelectedProgrammeId(undefined);
                        setSearchQuery("");
                      }}
                      className="h-8"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear Filters
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Showing {filteredCandidates.length} of {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              <CandidateDataTable
                candidates={filteredCandidates}
                loading={candidatesLoading}
                onSelect={(candidate) => {
                  setSelectedCandidate(candidate);
                  setDrawerOpen(true);
                }}
              />
            </TabsContent>

            <TabsContent value="programmes" className="mt-4">
              <ProgrammeDataTable
                programmes={programmes}
                loading={programmesLoading}
                schoolId={schoolId!}
                onRemove={handleRemoveProgramme}
              />
            </TabsContent>
          </Tabs>
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
