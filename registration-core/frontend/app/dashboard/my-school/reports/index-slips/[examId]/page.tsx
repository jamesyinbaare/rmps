"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useParams } from "next/navigation";
import {
  listAllSchoolExams,
  listSchoolProgrammes,
  downloadIndexSlipsBulk,
  downloadIndexSlipNamesPdf,
  listSchoolCandidates,
  downloadSchoolCandidateIndexSlip,
  downloadSchoolCandidateRegistrationDetails,
} from "@/lib/api";
import type {
  RegistrationExam,
  Programme,
  RegistrationCandidate,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import {
  Download,
  ArrowLeft,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";

type SortColumn = "name" | "index_number" | "registration_number" | "programme";
type SortEntry = { column: SortColumn; direction: "asc" | "desc" };
type PendingDownload =
  | { kind: "zip" }
  | { kind: "single"; candidate: RegistrationCandidate }
  | { kind: "single-ref"; candidate: RegistrationCandidate }
  | { kind: "names" };

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export default function IndexSlipsExamPage() {
  const params = useParams();
  const examId = Number(params.examId);

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCandidates, setDownloadingCandidates] = useState<
    Set<number>
  >(new Set());
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumns, setSortColumns] = useState<SortEntry[]>([]);
  const [includeRegistrationNumber, setIncludeRegistrationNumber] =
    useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDownload, setPendingDownload] =
    useState<PendingDownload | null>(null);
  const [downloadingNames, setDownloadingNames] = useState(false);

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
        if (!found) {
          toast.error("Examination not found");
        }
      } catch (error) {
        toast.error("Failed to load examination");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [examId]);

  useEffect(() => {
    if (!Number.isFinite(examId) || !exam) {
      setCandidates([]);
      return;
    }
    const loadCandidates = async () => {
      setLoadingCandidates(true);
      try {
        const allCandidatesData = await listSchoolCandidates(examId);
        let filteredCandidates = allCandidatesData;
        if (selectedProgrammeId && selectedProgrammeId !== "all") {
          const programmeIdNum = parseInt(selectedProgrammeId, 10);
          filteredCandidates = allCandidatesData.filter(
            (candidate) => candidate.programme_id === programmeIdNum
          );
        }
        filteredCandidates = filteredCandidates.filter(
          (candidate) =>
            candidate.index_number !== null &&
            candidate.index_number !== undefined
        );
        setCandidates(filteredCandidates);
      } catch (error) {
        toast.error("Failed to load candidates");
        console.error(error);
      } finally {
        setLoadingCandidates(false);
      }
    };
    loadCandidates();
  }, [examId, exam, selectedProgrammeId]);

  const programmeOptions = useMemo(
    () => [
      { value: "all", label: "All programmes" },
      ...programmes.map((programme) => ({
        value: programme.id.toString(),
        label: `${programme.code} - ${programme.name}`,
      })),
    ],
    [programmes]
  );

  const programmeIdForApi =
    selectedProgrammeId && selectedProgrammeId !== "all"
      ? parseInt(selectedProgrammeId, 10)
      : undefined;

  const filteredCandidates = useMemo(() => {
    let filtered = candidates;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = candidates.filter((candidate) => {
        const nameMatch = candidate.name?.toLowerCase().includes(query);
        const indexMatch = candidate.index_number?.toLowerCase().includes(query);
        return nameMatch || indexMatch;
      });
    }

    if (sortColumns.length > 0) {
      filtered = [...filtered].sort((a, b) => {
        for (const { column, direction } of sortColumns) {
          let aVal = "";
          let bVal = "";

          switch (column) {
            case "name":
              aVal = a.name?.toLowerCase() || "";
              bVal = b.name?.toLowerCase() || "";
              break;
            case "index_number":
              aVal = a.index_number?.toLowerCase() || "";
              bVal = b.index_number?.toLowerCase() || "";
              break;
            case "registration_number":
              aVal = a.registration_number?.toLowerCase() || "";
              bVal = b.registration_number?.toLowerCase() || "";
              break;
            case "programme": {
              const programmeA = programmes.find((p) => p.id === a.programme_id);
              const programmeB = programmes.find((p) => p.id === b.programme_id);
              aVal = programmeA?.name?.toLowerCase() || "";
              bVal = programmeB?.name?.toLowerCase() || "";
              break;
            }
            default:
              continue;
          }

          if (aVal < bVal) return direction === "asc" ? -1 : 1;
          if (aVal > bVal) return direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [candidates, searchQuery, sortColumns, programmes]);

  const handleSort = (
    column: SortColumn,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    const isShiftClick = event.shiftKey;

    setSortColumns((prev) => {
      const existingIndex = prev.findIndex((s) => s.column === column);
      if (existingIndex >= 0) {
        const newSorts = [...prev];
        newSorts[existingIndex] = {
          ...newSorts[existingIndex],
          direction:
            newSorts[existingIndex].direction === "asc" ? "desc" : "asc",
        };
        return newSorts;
      }
      if (isShiftClick) {
        return [...prev, { column, direction: "asc" }];
      }
      return [{ column, direction: "asc" }];
    });
  };

  const getSortIcon = (column: SortColumn) => {
    const sortIndex = sortColumns.findIndex((s) => s.column === column);
    if (sortIndex < 0) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    const sortEntry = sortColumns[sortIndex];
    const icon =
      sortEntry.direction === "asc" ? (
        <ArrowUp className="h-4 w-4" />
      ) : (
        <ArrowDown className="h-4 w-4" />
      );
    if (sortColumns.length > 1) {
      return (
        <span className="flex items-center gap-1">
          {icon}
          <span className="text-xs font-semibold">{sortIndex + 1}</span>
        </span>
      );
    }
    return icon;
  };

  const downloadReferenceSlip = async (candidate: RegistrationCandidate) => {
    if (!candidate.id || !candidate.index_number) {
      toast.error("Candidate index number not available");
      return;
    }
    setDownloadingCandidates((prev) => new Set(prev).add(candidate.id));
    try {
      const blob = await downloadSchoolCandidateRegistrationDetails(
        candidate.id
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registration_details_${candidate.index_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Reference slip downloaded for ${candidate.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to download reference slip"
      );
    } finally {
      setDownloadingCandidates((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  const requestDownload = (pending: PendingDownload) => {
    if (pending.kind === "single-ref") {
      void downloadReferenceSlip(pending.candidate);
      return;
    }
    if (pending.kind !== "single" && candidates.length === 0) {
      toast.message(
        "No candidates with index numbers found for the selected filters."
      );
      return;
    }
    if (pending.kind === "zip" || pending.kind === "single") {
      setIncludeRegistrationNumber(false);
    }
    setPendingDownload(pending);
    setConfirmOpen(true);
  };

  const runConfirmedDownload = async () => {
    if (!pendingDownload || !Number.isFinite(examId)) return;
    const pending = pendingDownload;
    const includeReg = includeRegistrationNumber;
    setConfirmOpen(false);
    setPendingDownload(null);

    if (pending.kind === "zip") {
      setDownloading(true);
      try {
        const result = await downloadIndexSlipsBulk(
          examId,
          programmeIdForApi,
          { includeRegistrationNumber: includeReg }
        );
        if (!result.ok) {
          if (result.empty) toast.message(result.message);
          else toast.error(result.message);
          return;
        }
        toast.success("Index slips downloaded successfully");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to download index slips"
        );
      } finally {
        setDownloading(false);
      }
      return;
    }

    if (pending.kind === "names") {
      setDownloadingNames(true);
      try {
        const result = await downloadIndexSlipNamesPdf(
          examId,
          programmeIdForApi
        );
        if (!result.ok) {
          if (result.empty) toast.message(result.message);
          else toast.error(result.message);
          return;
        }
        toast.success("Registration details PDF downloaded");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to download registration details PDF"
        );
      } finally {
        setDownloadingNames(false);
      }
      return;
    }

    if (pending.kind === "single-ref") {
      await downloadReferenceSlip(pending.candidate);
      return;
    }

    const candidate = pending.candidate;
    if (!candidate.id || !candidate.index_number) {
      toast.error("Candidate index number not available");
      return;
    }
    setDownloadingCandidates((prev) => new Set(prev).add(candidate.id));
    try {
      const blob = await downloadSchoolCandidateIndexSlip(candidate.id, {
        includeRegistrationNumber: includeReg,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `index_slip_${candidate.index_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Index slip downloaded for ${candidate.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download index slip"
      );
    } finally {
      setDownloadingCandidates((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  const isIndexConfirm =
    pendingDownload?.kind === "zip" || pendingDownload?.kind === "single";

  const confirmTitle =
    pendingDownload?.kind === "names"
      ? "Download registration details?"
      : pendingDownload?.kind === "single"
        ? "Download this index slip?"
        : "Download index slips?";

  const confirmDescription =
    pendingDownload?.kind === "names"
      ? "You will download a PDF of registration-detail cards for each candidate (same as the index slip, including registration numbers and photos, but without the examination timetable)."
      : "Confirm what will appear on the index slip PDF before downloading.";

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
          title="Index Slips"
          subtitle="Examination not found"
          back={
            <Button variant="ghost" size="sm" asChild className="shadow-none">
              <Link href="/dashboard/my-school/reports/index-slips">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Index Slips
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
        subtitle="Download index slips for candidates with index numbers"
        back={
          <Button variant="ghost" size="sm" asChild className="shadow-none">
            <Link href="/dashboard/my-school/reports/index-slips">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Index Slips
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="w-full max-w-md space-y-2">
          <Label htmlFor="programme" className="text-xs text-muted-foreground">
            Programme
          </Label>
          <SearchableSelect
            options={programmeOptions}
            value={selectedProgrammeId}
            onValueChange={(value) => setSelectedProgrammeId(value || "all")}
            placeholder="All programmes"
            searchPlaceholder="Search programmes…"
            emptyMessage="No programmes found."
            className="h-9 shadow-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => requestDownload({ kind: "zip" })}
            disabled={
              downloading ||
              downloadingNames ||
              loadingCandidates ||
              candidates.length === 0
            }
            className="h-9 shadow-none"
            title={
              !loadingCandidates && candidates.length === 0
                ? "No candidates with index numbers for the selected filters"
                : undefined
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Downloading…" : "Download all slips (ZIP)"}
          </Button>
          <Button
            variant="outline"
            onClick={() => requestDownload({ kind: "names" })}
            disabled={
              downloading ||
              downloadingNames ||
              loadingCandidates ||
              candidates.length === 0
            }
            className="h-9 shadow-none"
          >
            <FileText className="mr-2 h-4 w-4" />
            {downloadingNames
              ? "Downloading…"
              : "Download registration details"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            Candidates ({filteredCandidates.length})
          </p>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or index number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 shadow-none"
            />
          </div>
        </div>

        {loadingCandidates ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading candidates…
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {searchQuery
              ? "No candidates match your search"
              : "No candidates found with index numbers"}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">Sorting tip: </span>
                Click a column header to sort. Hold{" "}
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-xs font-semibold">
                  Shift
                </kbd>{" "}
                and click to add additional sort columns.
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={(e) => handleSort("name", e)}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Name {getSortIcon("name")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={(e) => handleSort("index_number", e)}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Index Number {getSortIcon("index_number")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={(e) => handleSort("registration_number", e)}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Registration Number{" "}
                        {getSortIcon("registration_number")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={(e) => handleSort("programme", e)}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Programme {getSortIcon("programme")}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => {
                    const programme = programmes.find(
                      (p) => p.id === candidate.programme_id
                    );
                    return (
                      <TableRow key={candidate.id}>
                        <TableCell className="font-medium">
                          {candidate.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {candidate.index_number || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {candidate.registration_number || "—"}
                        </TableCell>
                        <TableCell>{programme?.name || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              onClick={() =>
                                requestDownload({
                                  kind: "single",
                                  candidate,
                                })
                              }
                              disabled={
                                downloadingCandidates.has(candidate.id) ||
                                downloading ||
                                downloadingNames
                              }
                              size="sm"
                              variant="outline"
                              className="h-8 shadow-none"
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                              {downloadingCandidates.has(candidate.id)
                                ? "…"
                                : "Index slip"}
                            </Button>
                            <Button
                              onClick={() =>
                                requestDownload({
                                  kind: "single-ref",
                                  candidate,
                                })
                              }
                              disabled={
                                downloadingCandidates.has(candidate.id) ||
                                downloading ||
                                downloadingNames
                              }
                              size="sm"
                              variant="outline"
                              className="h-8 shadow-none"
                            >
                              <FileText className="mr-1.5 h-3.5 w-3.5" />
                              Reference slip
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingDownload(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {isIndexConfirm ? (
            <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
              <Switch
                id="modal-include-reg-number"
                checked={includeRegistrationNumber}
                onCheckedChange={setIncludeRegistrationNumber}
              />
              <Label
                htmlFor="modal-include-reg-number"
                className="cursor-pointer text-sm font-normal leading-snug"
              >
                Include registration number on index slips
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {includeRegistrationNumber
                    ? "Registration number will appear on the PDF."
                    : "Off by default — registration number will not appear."}
                </span>
              </Label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmedDownload}>
              Confirm download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
