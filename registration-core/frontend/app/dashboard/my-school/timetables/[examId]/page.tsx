"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Filter } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAllSchoolExams,
  listSchoolProgrammes,
  downloadMySchoolTimetable,
  getTimetablePreview,
} from "@/lib/api";
import type {
  RegistrationExam,
  Programme,
  TimetableDownloadFilter,
  TimetableResponse,
} from "@/types";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export default function TimetableExamPage() {
  const params = useParams();
  const examId = Number(params.examId);

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(
    null
  );
  const [subjectFilter, setSubjectFilter] =
    useState<TimetableDownloadFilter>("ALL");
  const [mergeByDate, setMergeByDate] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "portrait"
  );
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewData, setPreviewData] = useState<TimetableResponse | null>(
    null
  );
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(examId)) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [examsData, programmesData] = await Promise.all([
          listAllSchoolExams(),
          listSchoolProgrammes(),
        ]);
        const found = examsData.find((e) => e.id === examId) || null;
        setExam(found);
        setProgrammes(programmesData);
        if (!found) toast.error("Examination not found");
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Failed to load examination");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [examId]);

  useEffect(() => {
    if (!Number.isFinite(examId) || !exam) {
      setPreviewData(null);
      return;
    }
    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const preview = await getTimetablePreview(
          examId,
          subjectFilter,
          selectedProgrammeId || undefined
        );
        setPreviewData(preview);
      } catch (error) {
        console.error("Failed to load preview:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load preview";
        if (!errorMessage.includes("Unable to connect")) {
          toast.error(errorMessage);
        }
        setPreviewData(null);
      } finally {
        setLoadingPreview(false);
      }
    };
    loadPreview();
  }, [examId, exam, subjectFilter, selectedProgrammeId, mergeByDate]);

  const handleDownload = async () => {
    if (!Number.isFinite(examId)) {
      toast.error("Examination not found");
      return;
    }
    setDownloading(true);
    try {
      await downloadMySchoolTimetable(
        examId,
        subjectFilter,
        selectedProgrammeId || undefined,
        mergeByDate,
        orientation
      );
      toast.success("Timetable downloaded successfully");
    } catch (error) {
      console.error("Failed to download timetable:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to download timetable"
      );
    } finally {
      setDownloading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return timeStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const dayOfWeek = date
        .toLocaleDateString("en-US", { weekday: "long" })
        .toUpperCase();
      const dateDisplay = date
        .toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
        .toUpperCase();
      return { dayOfWeek, dateDisplay };
    } catch {
      return { dayOfWeek: "", dateDisplay: dateStr };
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Timetable"
          subtitle="Examination not found"
          back={
            <Button variant="ghost" size="sm" asChild className="shadow-none">
              <Link href="/dashboard/my-school/timetables">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Timetables
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={examTitle(exam)}
        subtitle="View and download this examination timetable"
        back={
          <Button variant="ghost" size="sm" asChild className="shadow-none">
            <Link href="/dashboard/my-school/timetables">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Timetables
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="programme">Programme (optional)</Label>
            <Select
              value={selectedProgrammeId?.toString() || "all"}
              onValueChange={(value) =>
                setSelectedProgrammeId(
                  value === "all" ? null : parseInt(value, 10)
                )
              }
            >
              <SelectTrigger id="programme" className="h-9 shadow-none">
                <SelectValue placeholder="All programmes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {programmes.map((programme) => (
                  <SelectItem
                    key={programme.id}
                    value={programme.id.toString()}
                  >
                    {programme.code} - {programme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject-filter">Subject filter</Label>
            <Select
              value={subjectFilter}
              onValueChange={(value) =>
                setSubjectFilter(value as TimetableDownloadFilter)
              }
            >
              <SelectTrigger id="subject-filter" className="h-9 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All subjects</SelectItem>
                <SelectItem value="CORE_ONLY">Core subjects only</SelectItem>
                <SelectItem value="ELECTIVE_ONLY">
                  Elective subjects only
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Merge mode</Label>
            <RadioGroup
              value={mergeByDate ? "merged" : "individual"}
              onValueChange={(value) => setMergeByDate(value === "merged")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="merge-individual" />
                <Label
                  htmlFor="merge-individual"
                  className="cursor-pointer font-normal"
                >
                  Individual (one row per subject)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merged" id="merge-merged" />
                <Label
                  htmlFor="merge-merged"
                  className="cursor-pointer font-normal"
                >
                  Merged (subjects on same date)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Page orientation</Label>
            <RadioGroup
              value={orientation}
              onValueChange={(value) =>
                setOrientation(value as "portrait" | "landscape")
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="portrait"
                  id="school-orientation-portrait"
                />
                <Label
                  htmlFor="school-orientation-portrait"
                  className="cursor-pointer font-normal"
                >
                  Portrait
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="landscape"
                  id="school-orientation-landscape"
                />
                <Label
                  htmlFor="school-orientation-landscape"
                  className="cursor-pointer font-normal"
                >
                  Landscape
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="h-9 shadow-none"
        >
          {downloading ? (
            "Downloading…"
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download timetable PDF
            </>
          )}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Timetable preview</p>
            <p className="text-xs text-muted-foreground">
              Entries sorted by date and time
            </p>
          </div>
        </div>
        <div className="p-4">
          {loadingPreview ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading preview…
            </div>
          ) : previewData && previewData.entries.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Showing {previewData.entries.length} entries for{" "}
                {previewData.exam_type} {previewData.exam_series || ""}{" "}
                {previewData.year}
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px] text-center">SN</TableHead>
                      <TableHead className="text-center">
                        Original Subject Code
                      </TableHead>
                      <TableHead>Subject Name</TableHead>
                      <TableHead className="text-center">Date</TableHead>
                      <TableHead className="text-center">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      if (mergeByDate) {
                        const entriesByDate = new Map<
                          string,
                          typeof previewData.entries
                        >();
                        previewData.entries.forEach((entry) => {
                          const dateKey = entry.examination_date;
                          if (!entriesByDate.has(dateKey)) {
                            entriesByDate.set(dateKey, []);
                          }
                          entriesByDate.get(dateKey)!.push(entry);
                        });

                        const sortedDates = Array.from(
                          entriesByDate.keys()
                        ).sort();
                        let sn = 1;
                        const rows: React.ReactElement[] = [];

                        sortedDates.forEach((dateKey) => {
                          const dayEntries = entriesByDate.get(dateKey)!;
                          const firstEntry = dayEntries[0];
                          const { dayOfWeek, dateDisplay } = formatDate(
                            firstEntry.examination_date
                          );

                          dayEntries.forEach((entry, idx) => {
                            const timeStr = formatTime(entry.examination_time);
                            rows.push(
                              <TableRow key={`${dateKey}-${idx}`}>
                                {idx === 0 && (
                                  <>
                                    <TableCell
                                      className="text-center"
                                      rowSpan={dayEntries.length}
                                    >
                                      {sn}
                                    </TableCell>
                                    <TableCell className="text-center font-mono">
                                      <div className="flex flex-col gap-1">
                                        <div>{entry.subject_code}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {timeStr}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      className="truncate"
                                      title={entry.subject_name}
                                    >
                                      {entry.subject_name.length > 25
                                        ? `${entry.subject_name.substring(0, 25)}...`
                                        : entry.subject_name}
                                    </TableCell>
                                    <TableCell
                                      className="text-center"
                                      rowSpan={dayEntries.length}
                                    >
                                      <div className="font-semibold">
                                        {dayOfWeek}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {dateDisplay}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {entry.duration_minutes
                                        ? `${entry.duration_minutes} min`
                                        : "—"}
                                    </TableCell>
                                  </>
                                )}
                                {idx > 0 && (
                                  <>
                                    <TableCell className="text-center font-mono">
                                      <div className="flex flex-col gap-1">
                                        <div>{entry.subject_code}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {formatTime(entry.examination_time)}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      className="truncate"
                                      title={entry.subject_name}
                                    >
                                      {entry.subject_name.length > 25
                                        ? `${entry.subject_name.substring(0, 25)}...`
                                        : entry.subject_name}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {entry.duration_minutes
                                        ? `${entry.duration_minutes} min`
                                        : "—"}
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            );
                          });
                          sn += 1;
                        });

                        return rows;
                      }

                      return previewData.entries.map((entry, index) => {
                        const { dayOfWeek, dateDisplay } = formatDate(
                          entry.examination_date
                        );
                        return (
                          <TableRow key={index}>
                            <TableCell className="text-center">
                              {index + 1}
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {entry.subject_code}
                            </TableCell>
                            <TableCell
                              className="truncate"
                              title={entry.subject_name}
                            >
                              {entry.subject_name.length > 25
                                ? `${entry.subject_name.substring(0, 25)}...`
                                : entry.subject_name}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="font-semibold">{dayOfWeek}</div>
                              <div className="text-sm text-muted-foreground">
                                {dateDisplay}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.duration_minutes
                                ? `${entry.duration_minutes} min`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No timetable entries found for the selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
