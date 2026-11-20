"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  listAvailableExams,
  listSchoolProgrammes,
  getProgrammeSubjects,
  bulkUploadCandidates,
  downloadCandidateTemplate,
} from "@/lib/api";
import type {
  RegistrationExam,
  Programme,
  ProgrammeSubjectRequirements,
  BulkUploadResponse,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  allowedSchoolRegistrationTypes,
  isMayJuneSeries,
  isNovDecSeries,
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function BulkRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examIdParam = searchParams.get("exam_id");

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [bulkRegistrationType, setBulkRegistrationType] = useState("");
  const [defaultChoiceGroups, setDefaultChoiceGroups] = useState<
    Record<number, string>
  >({});
  const [bulkProgrammeSubjects, setBulkProgrammeSubjects] =
    useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingBulkSubjects, setLoadingBulkSubjects] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!examIdParam) {
        toast.error("Select an examination first");
        router.replace("/dashboard/my-school/register");
        return;
      }
      setLoading(true);
      try {
        const exams = await listAvailableExams();
        const found = exams.find((e) => e.id.toString() === examIdParam);
        if (!found) {
          toast.error("Examination not found");
          router.replace("/dashboard/my-school/register");
          return;
        }
        setExam(found);
        setBulkRegistrationType(
          found.exam_kind === "private"
            ? "private"
            : primaryRegistrationType(found)
        );
        const progs = await listSchoolProgrammes(found.id);
        setProgrammes(progs);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load bulk upload page");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [examIdParam, router]);

  useEffect(() => {
    if (!exam || programmes.length === 0) {
      setBulkProgrammeSubjects(null);
      return;
    }
    if (
      exam.exam_kind === "private" ||
      !isMayJuneSeries(exam.exam_series)
    ) {
      setBulkProgrammeSubjects(null);
      return;
    }
    const load = async () => {
      setLoadingBulkSubjects(true);
      try {
        const subjects = await getProgrammeSubjects(programmes[0].id);
        if (subjects?.optional_core_groups?.length) {
          setBulkProgrammeSubjects(subjects);
        } else {
          setBulkProgrammeSubjects(null);
        }
      } catch {
        setBulkProgrammeSubjects(null);
      } finally {
        setLoadingBulkSubjects(false);
      }
    };
    load();
  }, [exam, programmes]);

  const hubHref = exam
    ? `/dashboard/my-school/register/${exam.id}`
    : "/dashboard/my-school/register";

  const typeOptions = allowedSchoolRegistrationTypes(exam);

  const acceptFile = (f: File | undefined) => {
    if (!f) return;
    const ok =
      f.type.includes("csv") ||
      f.type.includes("spreadsheet") ||
      f.name.endsWith(".xlsx") ||
      f.name.endsWith(".xls") ||
      f.name.endsWith(".csv");
    if (!ok) {
      toast.error("Please select a CSV or Excel file");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDownloadTemplate = async () => {
    if (!exam) return;
    setDownloadingTemplate(true);
    try {
      const blob = await downloadCandidateTemplate(exam.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exam.year}_${(exam.exam_series || "").replace("/", "_")}_${exam.exam_type.replace(/ /g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download template"
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleUpload = async () => {
    if (!exam || !file) {
      toast.error("Select a file to upload");
      return;
    }
    setUploading(true);
    setResult(null);
    setUploadProgress(15);

    const tick = window.setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + 8));
    }, 400);

    try {
      const isPrivate = exam.exam_kind === "private";
      const registrationTypeToSend = isPrivate
        ? "private"
        : bulkRegistrationType || undefined;
      const useSubjectCodesPath =
        isPrivate || isNovDecSeries(exam.exam_series);
      const defaultSelections = useSubjectCodesPath
        ? undefined
        : Object.keys(defaultChoiceGroups).length > 0
          ? defaultChoiceGroups
          : undefined;

      const uploadResult = await bulkUploadCandidates(
        exam.id,
        file,
        defaultSelections,
        registrationTypeToSend
      );
      setUploadProgress(100);
      setResult(uploadResult);
      if (uploadResult.failed === 0) {
        toast.success(
          `Successfully uploaded ${uploadResult.successful} candidate(s)`
        );
      } else {
        toast.warning(
          `Upload completed with ${uploadResult.failed} error(s)`
        );
      }
      setFile(null);
      setDefaultChoiceGroups({});
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload candidates"
      );
    } finally {
      window.clearInterval(tick);
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 600);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!exam) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" asChild>
            <Link href={hubHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to register
            </Link>
          </Button>
        }
        title="Bulk upload"
        subtitle={`${exam.exam_type} ${exam.exam_series || ""} ${exam.year}`}
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <HelpCircle className="mr-2 h-4 w-4" />
                Template help
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm" align="end">
              <p className="font-medium">File columns</p>
              <p className="mt-2 text-muted-foreground">
                Required: name (or firstname + lastname), programme_code (or
                programme_id). Optional: registration_type, subject_codes,
                guardian fields
                {exam.exam_kind === "private" ? ", examination_center" : ""}.
              </p>
            </PopoverContent>
          </Popover>
        }
      />

      <section>
        <SectionLabel>Defaults</SectionLabel>
        <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
          <div className="space-y-2">
            <Label>Default registration type</Label>
            <Select
              value={bulkRegistrationType}
              onValueChange={setBulkRegistrationType}
              disabled={exam.exam_kind === "private" || uploading}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {registrationTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applied when a row omits registration_type. Rows can still
              override with referral when allowed.
            </p>
          </div>

          {loadingBulkSubjects && (
            <p className="text-sm text-muted-foreground">
              Loading optional core defaults…
            </p>
          )}

          {bulkProgrammeSubjects?.optional_core_groups?.map((group) => (
            <div key={group.choice_group_id} className="space-y-2">
              <Label>
                Default optional core — group {group.choice_group_id}
              </Label>
              <Select
                value={defaultChoiceGroups[group.choice_group_id] || "__none__"}
                onValueChange={(value) => {
                  setDefaultChoiceGroups((prev) => {
                    const next = { ...prev };
                    if (!value || value === "__none__") {
                      delete next[group.choice_group_id];
                    } else {
                      next[group.choice_group_id] = value;
                    }
                    return next;
                  });
                }}
                disabled={uploading}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="No default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No default</SelectItem>
                  {group.subjects.map((s) => (
                    <SelectItem key={s.subject_id} value={s.subject_code}>
                      {s.subject_code} — {s.subject_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
            >
              {downloadingTemplate ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download template
            </Button>
          }
        >
          Upload file
        </SectionLabel>
        <div
          className={cn(
            "rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-none transition-colors",
            isDragOver && "border-primary bg-primary/5"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
        >
          <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drag and drop CSV or Excel here
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            or choose a file from your computer
          </p>
          <div className="mt-4">
            <InputFile
              disabled={uploading}
              onFile={acceptFile}
            />
          </div>
          {file && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <Badge variant="secondary">{file.name}</Badge>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setFile(null)}
                disabled={uploading}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </section>

      {uploading && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-5 shadow-none">
          <div className="flex items-center justify-between text-sm">
            <span>Uploading…</span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}

      {result && (
        <section>
          <SectionLabel>Results</SectionLabel>
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
            <Alert
              variant={result.failed > 0 ? "destructive" : "default"}
            >
              <AlertDescription>
                {result.successful} successful, {result.failed} failed of{" "}
                {result.total_rows} rows.
              </AlertDescription>
            </Alert>
            {result.errors?.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((err, i) => (
                      <TableRow key={`${err.row_number}-${i}`}>
                        <TableCell className="font-mono">
                          {err.row_number}
                        </TableCell>
                        <TableCell>{err.field || "—"}</TableCell>
                        <TableCell>{err.error_message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" asChild>
          <Link href={hubHref}>Cancel</Link>
        </Button>
        <Button onClick={handleUpload} disabled={!file || uploading}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload candidates
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function InputFile({
  disabled,
  onFile,
}: {
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer">
      <span className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-none hover:bg-accent hover:text-accent-foreground">
        Choose file
      </span>
      <input
        type="file"
        className="hidden"
        accept=".csv,.xlsx,.xls"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </label>
  );
}
