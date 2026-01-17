"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAllSchoolExams, listSchoolProgrammes, downloadMySchoolTimetable, getTimetablePreview } from "@/lib/api";
import type { RegistrationExam, Programme, TimetableDownloadFilter, TimetableResponse } from "@/types";
import { toast } from "sonner";

export default function TimetablesPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<TimetableDownloadFilter>("ALL");
  const [mergeByDate, setMergeByDate] = useState<boolean>(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState<TimetableResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [examsData, programmesData] = await Promise.all([
          listAllSchoolExams(),
          listSchoolProgrammes(),
        ]);
        setExams(examsData);
        setProgrammes(programmesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedExamId) {
        setPreviewData(null);
        return;
      }

      setLoadingPreview(true);
      try {
        const preview = await getTimetablePreview(
          selectedExamId,
          subjectFilter,
          selectedProgrammeId || undefined
        );
        setPreviewData(preview);
      } catch (error) {
        console.error("Failed to load preview:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to load preview";
        if (!errorMessage.includes("Unable to connect")) {
          toast.error(errorMessage);
        }
        setPreviewData(null);
      } finally {
        setLoadingPreview(false);
      }
    };

    loadPreview();
  }, [selectedExamId, subjectFilter, selectedProgrammeId, mergeByDate]);

  const handleDownload = async () => {
    if (!selectedExamId) {
      toast.error("Please select an examination first");
      return;
    }

    setDownloading(true);
    try {
      await downloadMySchoolTimetable(
        selectedExamId,
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
      setDownloading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes);
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return timeStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
      const dateDisplay = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      }).toUpperCase();
      return { dayOfWeek, dateDisplay };
    } catch {
      return { dayOfWeek: "", dateDisplay: dateStr };
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
        <p className="text-muted-foreground">View and download examination timetables for your school</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timetable Filters
          </CardTitle>
          <CardDescription>Select examination and filters to generate timetable</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="programme">Programme (Optional)</Label>
            <Select
              value={selectedProgrammeId?.toString() || "all"}
              onValueChange={(value) => setSelectedProgrammeId(value === "all" ? null : parseInt(value))}
              disabled={!selectedExamId}
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
          </div>

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
                <RadioGroupItem value="individual" id="merge-individual" />
                <Label htmlFor="merge-individual" className="font-normal cursor-pointer">
                  Individual (one row per subject)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merged" id="merge-merged" />
                <Label htmlFor="merge-merged" className="font-normal cursor-pointer">
                  Merged (subjects on same date)
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
                <RadioGroupItem value="portrait" id="school-orientation-portrait" />
                <Label htmlFor="school-orientation-portrait" className="font-normal cursor-pointer">
                  Portrait
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="landscape" id="school-orientation-landscape" />
                <Label htmlFor="school-orientation-landscape" className="font-normal cursor-pointer">
                  Landscape
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Button
            onClick={handleDownload}
            disabled={!selectedExamId || downloading}
            className="w-full"
          >
            {downloading ? (
              "Downloading..."
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Timetable PDF
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {selectedExamId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Timetable Preview
            </CardTitle>
            <CardDescription>
              Preview of timetable entries sorted by date and time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPreview ? (
              <div className="text-center py-12 text-muted-foreground">Loading preview...</div>
            ) : previewData && previewData.entries.length > 0 ? (
              <div className="space-y-6">
                <div className="text-sm text-muted-foreground">
                  Showing {previewData.entries.length} entries for{" "}
                  {previewData.exam_type} {previewData.exam_series || ""} {previewData.year}
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center w-[60px]">SN</TableHead>
                        <TableHead className="text-center">Original Subject Code</TableHead>
                        <TableHead>Subject Name</TableHead>
                        <TableHead className="text-center">Date</TableHead>
                        <TableHead className="text-center">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        if (mergeByDate) {
                          // Group entries by date
                          const entriesByDate = new Map<string, typeof previewData.entries>();
                          previewData.entries.forEach((entry) => {
                            const dateKey = entry.examination_date;
                            if (!entriesByDate.has(dateKey)) {
                              entriesByDate.set(dateKey, []);
                            }
                            entriesByDate.get(dateKey)!.push(entry);
                          });

                          const sortedDates = Array.from(entriesByDate.keys()).sort();
                          let sn = 1;
                           const rows: React.ReactElement[] = [];

                          sortedDates.forEach((dateKey) => {
                            const dayEntries = entriesByDate.get(dateKey)!;
                            const firstEntry = dayEntries[0];
                            const { dayOfWeek, dateDisplay } = formatDate(firstEntry.examination_date);

                            dayEntries.forEach((entry, idx) => {
                              const timeStr = formatTime(entry.examination_time);
                              rows.push(
                                <TableRow key={`${dateKey}-${idx}`}>
                                  {idx === 0 && (
                                    <>
                                      <TableCell className="text-center" rowSpan={dayEntries.length}>
                                        {sn}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        <div className="flex flex-col gap-1">
                                          <div>{entry.subject_code}</div>
                                          <div className="text-xs text-muted-foreground">{timeStr}</div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="truncate" title={entry.subject_name}>
                                        {entry.subject_name.length > 25 ? `${entry.subject_name.substring(0, 25)}...` : entry.subject_name}
                                      </TableCell>
                                      <TableCell className="text-center" rowSpan={dayEntries.length}>
                                        <div className="font-semibold">{dayOfWeek}</div>
                                        <div className="text-sm text-muted-foreground">{dateDisplay}</div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {entry.duration_minutes ? `${entry.duration_minutes} min` : "-"}
                                      </TableCell>
                                    </>
                                  )}
                                  {idx > 0 && (
                                    <>
                                      <TableCell className="text-center font-mono">
                                        <div className="flex flex-col gap-1">
                                          <div>{entry.subject_code}</div>
                                          <div className="text-xs text-muted-foreground">{formatTime(entry.examination_time)}</div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="truncate" title={entry.subject_name}>
                                        {entry.subject_name.length > 25 ? `${entry.subject_name.substring(0, 25)}...` : entry.subject_name}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {entry.duration_minutes ? `${entry.duration_minutes} min` : "-"}
                                      </TableCell>
                                    </>
                                  )}
                                </TableRow>
                              );
                            });
                            sn += 1;
                          });

                          return rows;
                        } else {
                          // Individual entries
                          return previewData.entries.map((entry, index) => {
                            const { dayOfWeek, dateDisplay } = formatDate(entry.examination_date);
                            return (
                              <TableRow key={index}>
                                <TableCell className="text-center">{index + 1}</TableCell>
                                <TableCell className="text-center font-mono">{entry.subject_code}</TableCell>
                                <TableCell className="truncate" title={entry.subject_name}>
                                  {entry.subject_name.length > 25 ? `${entry.subject_name.substring(0, 25)}...` : entry.subject_name}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="font-semibold">{dayOfWeek}</div>
                                  <div className="text-sm text-muted-foreground">{dateDisplay}</div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {entry.duration_minutes ? `${entry.duration_minutes} min` : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          });
                        }
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No timetable entries found for the selected filters.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
