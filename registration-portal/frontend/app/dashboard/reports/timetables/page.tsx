"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Calendar, Filter, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listAllExams,
  listSchools,
  getSchoolProgrammes,
  downloadTimetableForExam,
  downloadTimetableForSchool,
} from "@/lib/api";
import type {
  RegistrationExam,
  School as SchoolType,
  Programme,
  TimetableDownloadFilter,
} from "@/types";
import { toast } from "sonner";

export default function AdminTimetablesPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schools, setSchools] = useState<SchoolType[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<TimetableDownloadFilter>("ALL");
  const [mergeByDate, setMergeByDate] = useState<boolean>(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [examsData, schoolsData] = await Promise.all([
          listAllExams(),
          listSchools(),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        if (schoolsData.length === 0) {
          console.warn("No schools found");
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to load data";
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Convert schools to SearchableSelect format
  const schoolOptions = useMemo(() => {
    const options = schools.map((school) => ({
      value: school.id.toString(),
      label: `${school.code} - ${school.name}`,
    }));
    // Add "All schools" option at the beginning
    return [
      { value: "all", label: "All schools (entire examination)" },
      ...options,
    ];
  }, [schools]);

  useEffect(() => {
    const loadProgrammes = async () => {
      if (!selectedSchoolId) {
        setProgrammes([]);
        setSelectedProgrammeId(null);
        return;
      }

      setLoadingProgrammes(true);
      try {
        const programmesData = await getSchoolProgrammes(selectedSchoolId);
        setProgrammes(programmesData);
        setSelectedProgrammeId(null);
      } catch (error) {
        console.error("Failed to load programmes:", error);
        toast.error("Failed to load programmes");
        setProgrammes([]);
        setSelectedProgrammeId(null);
      } finally {
        setLoadingProgrammes(false);
      }
    };

    loadProgrammes();
  }, [selectedSchoolId]);

  const handleDownloadExamTimetable = async () => {
    if (!selectedExamId) {
      toast.error("Please select an examination first");
      return;
    }

    const downloadKey = `exam-${selectedExamId}`;
    setDownloading(downloadKey);
    try {
      await downloadTimetableForExam(selectedExamId, subjectFilter, mergeByDate, orientation);
      toast.success("Timetable downloaded successfully");
    } catch (error) {
      console.error("Failed to download timetable:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download timetable";
      toast.error(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadSchoolTimetable = async () => {
    if (!selectedExamId) {
      toast.error("Please select an examination first");
      return;
    }
    if (!selectedSchoolId) {
      toast.error("Please select a school first");
      return;
    }

    const downloadKey = `school-${selectedExamId}-${selectedSchoolId}`;
    setDownloading(downloadKey);
    try {
      await downloadTimetableForSchool(
        selectedExamId,
        selectedSchoolId,
        subjectFilter,
        selectedProgrammeId || undefined,
        mergeByDate,
        orientation
      );
      toast.success("Timetable downloaded successfully");
    } catch (error) {
      console.error("Failed to download timetable:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download timetable";
      toast.error(errorMessage);
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Examination Timetables</h1>
        <p className="text-muted-foreground">Download examination timetables for entire examination or specific schools</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timetable Filters
          </CardTitle>
          <CardDescription>Select school, examination and filters to generate timetable</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school">School</Label>
            <SearchableSelect
              options={schoolOptions}
              value={selectedSchoolId?.toString() || "all"}
              onValueChange={(value) => {
                if (!value) {
                  setSelectedSchoolId(null);
                } else {
                  setSelectedSchoolId(value === "all" ? null : parseInt(value));
                }
                // Clear exam selection when school changes
                setSelectedExamId(null);
                setSelectedProgrammeId(null);
              }}
              placeholder="All schools (entire examination)"
              disabled={loading || schools.length === 0}
              searchPlaceholder="Search schools..."
              emptyMessage="No schools found"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam">Examination</Label>
            <Select
              value={selectedExamId?.toString() || ""}
              onValueChange={(value) => setSelectedExamId(parseInt(value))}
            >
              <SelectTrigger id="exam">
                <SelectValue placeholder="Select an examination" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} {exam.exam_series || ""} {exam.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSchoolId && (
            <div className="space-y-2">
              <Label htmlFor="programme">Programme (Optional)</Label>
              <Select
                value={selectedProgrammeId?.toString() || "all"}
                onValueChange={(value) => setSelectedProgrammeId(value === "all" ? null : parseInt(value))}
                disabled={!selectedSchoolId || loadingProgrammes}
              >
                <SelectTrigger id="programme">
                  <SelectValue placeholder="All programmes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programmes</SelectItem>
                  {programmes.map((programme) => (
                    <SelectItem key={programme.id} value={programme.id.toString()}>
                      {programme.code} - {programme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingProgrammes && (
                <p className="text-sm text-muted-foreground">Loading programmes...</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="subject-filter">Subject Filter</Label>
            <Select
              value={subjectFilter}
              onValueChange={(value) => setSubjectFilter(value as TimetableDownloadFilter)}
              disabled={!selectedExamId}
            >
              <SelectTrigger id="subject-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Subjects</SelectItem>
                <SelectItem value="CORE_ONLY">Core Subjects Only</SelectItem>
                <SelectItem value="ELECTIVE_ONLY">Elective Subjects Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Merge Mode</Label>
            <RadioGroup
              value={mergeByDate ? "merged" : "individual"}
              onValueChange={(value) => setMergeByDate(value === "merged")}
              disabled={!selectedExamId}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="admin-merge-individual" />
                <Label htmlFor="admin-merge-individual" className="font-normal cursor-pointer">
                  Individual (one row per subject)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merged" id="admin-merge-merged" />
                <Label htmlFor="admin-merge-merged" className="font-normal cursor-pointer">
                  Merged (subjects on same day share SN and date)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Page Orientation</Label>
            <RadioGroup
              value={orientation}
              onValueChange={(value) => setOrientation(value as "portrait" | "landscape")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="portrait" id="admin-orientation-portrait" />
                <Label htmlFor="admin-orientation-portrait" className="font-normal cursor-pointer">
                  Portrait
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="landscape" id="admin-orientation-landscape" />
                <Label htmlFor="admin-orientation-landscape" className="font-normal cursor-pointer">
                  Landscape
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {selectedExamId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download Timetable
            </CardTitle>
            <CardDescription>
              {selectedSchoolId === null
                ? "Download timetable for entire examination"
                : `Download timetable for selected school${selectedProgrammeId ? " and programme" : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={selectedSchoolId === null ? handleDownloadExamTimetable : handleDownloadSchoolTimetable}
              disabled={downloading !== null || (selectedSchoolId !== null && !selectedSchoolId)}
              className="w-full"
            >
              {downloading !== null ? (
                "Downloading..."
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {selectedSchoolId === null ? "Download Entire Exam Timetable" : "Download School Timetable"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
