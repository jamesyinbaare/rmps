"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  listAvailableExams,
  listSchoolProgrammes,
  downloadCandidateTemplate,
  downloadCandidateTemplateInstructionsPdf,
  downloadBulkUploadResultsExcel,
} from "@/lib/api";
import type {
  RegistrationExam,
  Programme,
  BulkUploadResponse,
} from "@/types";
import {
  uploadBulkCandidatesInChunks,
  validateBulkCandidatesInChunks,
  type BulkCandidateRowPayload,
  type BulkUploadProgressState,
} from "@/lib/bulk-upload";
import { BulkUploadProgressCard } from "@/components/bulk/BulkUploadProgressCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  HelpCircle,
  IdCard,
  Loader2,
  Phone,
  Shield,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  allowedSchoolRegistrationTypes,
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";
import { cn } from "@/lib/utils";

const EXAMPLE_PROGRAMMES = [
  { code: "C301", name: "Building Construction" },
  { code: "C421", name: "Electrical Engineering Technology" },
  { code: "C601", name: "Catering and Hospitality Management" },
] as const;

function examFileBase(exam: RegistrationExam): string {
  const seriesSafe = (exam.exam_series || "").replace("/", "_");
  const typeSafe = exam.exam_type.replace(/ /g, "_").replace(/\//g, "_");
  return seriesSafe
    ? `${exam.year}_${seriesSafe}_${typeSafe}`
    : `${exam.year}_${typeSafe}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

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
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<BulkUploadProgressState | null>(
    null
  );
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [resultMode, setResultMode] = useState<"upload" | "validation" | null>(
    null
  );
  const [uploadedRows, setUploadedRows] = useState<BulkCandidateRowPayload[]>(
    []
  );
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingResults, setDownloadingResults] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [bulkRegistrationType, setBulkRegistrationType] = useState("");

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

  const hubHref = exam
    ? `/dashboard/my-school/register/${exam.id}`
    : "/dashboard/my-school/register";

  const typeOptions = allowedSchoolRegistrationTypes(exam);
  const isPrivate = exam?.exam_kind === "private";

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
    setResultMode(null);
    setUploadedRows([]);
    setProgress(null);
  };

  const handleDownloadTemplate = async () => {
    if (!exam) return;
    setDownloadingTemplate(true);
    try {
      const blob = await downloadCandidateTemplate(exam.id);
      triggerBlobDownload(blob, `${examFileBase(exam)}.xlsx`);
      toast.success("Excel template downloaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download template"
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDownloadInstructionsPdf = async () => {
    if (!exam) return;
    setDownloadingPdf(true);
    try {
      const blob = await downloadCandidateTemplateInstructionsPdf(exam.id);
      triggerBlobDownload(blob, `${examFileBase(exam)}_instructions.pdf`);
      toast.success("Instructions PDF downloaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download instructions"
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadResults = async () => {
    if (!exam || !result || uploadedRows.length === 0) return;
    setDownloadingResults(true);
    try {
      const blob = await downloadBulkUploadResultsExcel({
        rows: uploadedRows,
        errors: result.errors || [],
      });
      triggerBlobDownload(
        blob,
        `${examFileBase(exam)}_bulk_upload_results.xlsx`
      );
      toast.success("Results Excel downloaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download results"
      );
    } finally {
      setDownloadingResults(false);
    }
  };

  const busy = uploading || validating;

  const handleValidate = async () => {
    if (!exam || !file) {
      toast.error("Select a file to validate");
      return;
    }
    setValidating(true);
    setResult(null);
    setResultMode(null);
    setUploadedRows([]);
    setProgress({
      phase: "preparing",
      percent: 1,
      currentBatch: 0,
      totalBatches: 0,
      totalRows: 0,
      successful: 0,
      failed: 0,
      remaining: 0,
      message: "Preparing validation…",
    });

    try {
      const registrationTypeToSend = isPrivate
        ? "private"
        : bulkRegistrationType || undefined;

      const { result: validationResult, rows } =
        await validateBulkCandidatesInChunks({
          examId: exam.id,
          file,
          registrationType: registrationTypeToSend,
          onProgress: setProgress,
        });
      setResult(validationResult);
      setResultMode("validation");
      setUploadedRows(rows);
      if (validationResult.failed === 0) {
        toast.success(
          `Validation passed — ${validationResult.successful} row(s) would succeed`
        );
      } else {
        toast.warning(
          `Validation found ${validationResult.failed} error(s)`
        );
      }
    } catch (error) {
      setProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to validate file",
            }
          : prev
      );
      toast.error(
        error instanceof Error ? error.message : "Failed to validate file"
      );
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    if (!exam || !file) {
      toast.error("Select a file to upload");
      return;
    }
    setUploading(true);
    setResult(null);
    setResultMode(null);
    setUploadedRows([]);
    setProgress({
      phase: "preparing",
      percent: 1,
      currentBatch: 0,
      totalBatches: 0,
      totalRows: 0,
      successful: 0,
      failed: 0,
      remaining: 0,
      message: "Preparing upload…",
    });

    try {
      const registrationTypeToSend = isPrivate
        ? "private"
        : bulkRegistrationType || undefined;

      const { result: uploadResult, rows } = await uploadBulkCandidatesInChunks({
        examId: exam.id,
        file,
        registrationType: registrationTypeToSend,
        onProgress: setProgress,
      });
      setResult(uploadResult);
      setResultMode("upload");
      setUploadedRows(rows);
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
    } catch (error) {
      setProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to upload candidates",
            }
          : prev
      );
      toast.error(
        error instanceof Error ? error.message : "Failed to upload candidates"
      );
    } finally {
      setUploading(false);
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInstructionsOpen(true)}
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            Instructions
          </Button>
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
              disabled={isPrivate || busy}
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
              override with referral when allowed. For free_tvet and fee_paying,
              each row must include option (SOC or ENT). Dates use DD/MM/YYYY;
              phones are 10-digit Ghana numbers starting with 0.
            </p>
          </div>
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
            or choose a file from your computer. Uploads run in small batches
            with automatic retry on poor connections.
          </p>
          <div className="mt-4">
            <InputFile disabled={busy} onFile={acceptFile} />
          </div>
          {file && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <Badge variant="secondary">{file.name}</Badge>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setFile(null)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          )}
        </div>
        {programmes.length === 0 && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            No programmes linked to your school for this exam yet.
          </p>
        )}
      </section>

      {(busy || progress) && progress && (
        <BulkUploadProgressCard
          progress={progress}
          mode={
            validating || resultMode === "validation" ? "validation" : "upload"
          }
          onDismiss={
            progress.phase === "done" || progress.phase === "error"
              ? () => setProgress(null)
              : undefined
          }
        />
      )}

      {result && (
        <section>
          <SectionLabel>
            {resultMode === "validation" ? "Validation results" : "Results"}
          </SectionLabel>
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Alert
                variant={result.failed > 0 ? "destructive" : "default"}
                className="min-w-0 flex-1"
              >
                <AlertDescription>
                  {resultMode === "validation"
                    ? `${result.successful} would succeed, ${result.failed} failed of ${result.total_rows} rows. No candidates were created.`
                    : `${result.successful} successful, ${result.failed} failed of ${result.total_rows} rows.`}
                </AlertDescription>
              </Alert>
              {uploadedRows.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadResults}
                  disabled={downloadingResults}
                >
                  {downloadingResults ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download results (Excel)
                </Button>
              )}
            </div>
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
        <Button
          type="button"
          variant="outline"
          onClick={handleValidate}
          disabled={!file || busy}
        >
          {validating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Validate file
            </>
          )}
        </Button>
        <Button onClick={handleUpload} disabled={!file || busy}>
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

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden border-border/80 p-0 shadow-2xl sm:rounded-2xl">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-border/60 px-0 py-0 text-left">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%),linear-gradient(180deg,color-mix(in_oklab,var(--primary)_8%,var(--background)),var(--background))]"
            />
            <div className="relative px-6 pb-5 pt-6 pr-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                School registration guide
              </p>
              <DialogTitle className="mt-1.5 text-2xl font-semibold tracking-tight">
                Bulk upload instructions
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-xl text-[15px] leading-relaxed">
                A clear walkthrough of the spreadsheet columns, formats, and
                what happens after you upload.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
            <BulkInstructionsContent isPrivate={!!isPrivate} />
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={handleDownloadInstructionsPdf}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            <Button type="button" onClick={() => setInstructionsOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BulkInstructionsContent({ isPrivate }: { isPrivate: boolean }) {
  const requiredColumns: ColumnItem[] = [
    {
      name: "firstname",
      text: "Candidate’s given / first name. Required on every row.",
      example: "Kwame",
    },
    {
      name: "lastname",
      text: "Candidate’s family / surname. Required on every row.",
      example: "Mensah",
    },
    {
      name: "date_of_birth",
      text: "Date only as DD/MM/YYYY. Alias: dob.",
      example: "15/01/2005",
    },
    {
      name: "gender",
      text: "Recorded gender for the candidate.",
      example: "M or F",
    },
    {
      name: "programme_code",
      text: "Programme code assigned to your school. Alias: programme.",
      example: "C301",
    },
    ...(isPrivate
      ? [
          {
            name: "subject_codes",
            text: "Comma-separated subject codes for private registration.",
            example: "C701,C702",
          },
        ]
      : [
          {
            name: "option",
            text: "Optional core for free_tvet and fee_paying. SOC/C702 or ENT/C705.",
            example: "SOC",
          },
        ]),
  ];

  return (
    <div className="space-y-8 px-6 py-6">
      <section className="space-y-3">
        <SectionEyebrow>How it works</SectionEyebrow>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Download template",
              body: "Get the Excel file and keep the header row intact.",
            },
            {
              step: "2",
              title: "Fill one row each",
              body: "Enter candidates using the formats below.",
            },
            {
              step: "3",
              title: "Upload & review",
              body: "Fix any failed rows, then add photos and fees.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="relative overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-none"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {item.step}
              </div>
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Successful rows create <span className="font-medium text-foreground">Incomplete</span>{" "}
          candidates. Photos and fee payment may still be needed before
          registration is complete.
        </p>
      </section>

      <section className="space-y-3">
        <SectionEyebrow>Must get right</SectionEyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <RuleCard
            icon={UserRound}
            title="Split the name"
            body={
              <>
                Use <Code>firstname</Code> and <Code>lastname</Code>. There is
                no single name column. <Code>othername</Code> is optional.
              </>
            }
          />
          <RuleCard
            icon={CalendarDays}
            title="Date format"
            body={
              <>
                Always use <Code>DD/MM/YYYY</Code>. Example:{" "}
                <Code>15/01/2005</Code>. Do not use YYYY-MM-DD.
              </>
            }
          />
          <RuleCard
            icon={Phone}
            title="Ghana phone numbers"
            body={
              <>
                If provided, use 10 digits starting with <Code>0</Code>. Example:{" "}
                <Code>0244123456</Code>. No <Code>+233</Code>.
              </>
            }
          />
          {!isPrivate ? (
            <RuleCard
              icon={CheckCircle2}
              title="Option subject"
              body={
                <>
                  For free_tvet and fee_paying, set <Code>option</Code> to{" "}
                  <Code>SOC</Code> / <Code>C702</Code> or <Code>ENT</Code> /{" "}
                  <Code>C705</Code>.
                </>
              }
            />
          ) : (
            <RuleCard
              icon={CheckCircle2}
              title="Subject codes"
              body={
                <>
                  Private rows need <Code>subject_codes</Code> as a
                  comma-separated list.
                </>
              }
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <SectionEyebrow>Required columns</SectionEyebrow>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
            Green headers in Excel
          </Badge>
        </div>
        <ColumnGrid items={requiredColumns} tone="required" />

        <div className="overflow-hidden rounded-xl border border-border/80 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_7%,var(--card)),var(--card))] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IdCard className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                Example programmes in the template
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Replace these with codes assigned to your school for this exam.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {EXAMPLE_PROGRAMMES.map((p) => (
                  <div
                    key={p.code}
                    className="rounded-lg border border-border/70 bg-background/80 px-3 py-2.5"
                  >
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {p.code}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {p.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <SectionEyebrow>Optional · identity & contact</SectionEyebrow>
          <Badge variant="secondary" className="font-normal">
            Yellow headers
          </Badge>
        </div>
        <ColumnGrid
          items={[
            { name: "othername", text: "Middle or other given name." },
            { name: "national_id", text: "National ID if available." },
            {
              name: "contact_email",
              text: "Email address. Alias: email.",
            },
            {
              name: "contact_phone",
              text: "10-digit Ghana mobile starting with 0. Alias: phone.",
              example: "0244123456",
            },
            { name: "address", text: "Residential or postal address." },
            {
              name: "disability",
              text: "Disability information if applicable; leave blank if none.",
            },
          ]}
          tone="optional"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <SectionEyebrow className="mb-0">Guardian</SectionEyebrow>
        </div>
        <ColumnGrid
          items={[
            { name: "guardian_name", text: "Parent or guardian full name." },
            {
              name: "guardian_phone",
              text: "Same 10-digit Ghana phone rule as contact_phone.",
              example: "0201234567",
            },
            {
              name: "guardian_digital_address",
              text: "GhanaPost GPS / digital address.",
              example: "GA-123-4567",
            },
            {
              name: "guardian_national_id",
              text: "Guardian national ID if available.",
            },
          ]}
          tone="optional"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <SectionEyebrow className="mb-0">Registration</SectionEyebrow>
        </div>
        <ColumnGrid
          items={[
            {
              name: "registration_type",
              text: isPrivate
                ? "Use private. Applied automatically if omitted."
                : "Overrides the page default. free_tvet/fee_paying need option; referral needs subject_codes.",
            },
            ...(!isPrivate
              ? [
                  {
                    name: "subject_codes",
                    text: "Required for referral rows — comma-separated codes.",
                    example: "C701,C702",
                  },
                ]
              : [
                  {
                    name: "examination_center",
                    text: "Center school id. Aliases: school_id, center_id. Blank uses your school.",
                  },
                ]),
          ]}
          tone="optional"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-2">
            <p className="font-medium text-foreground">After upload</p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Failed rows are skipped — use the field name in the results
                table to fix and re-upload.
              </li>
              <li>
                Keep Excel cells formatted as text so leading zeros in phone
                numbers are preserved.
              </li>
              <li>
                Green headers are required; yellow headers are optional.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

type ColumnItem = {
  name: string;
  text: string;
  example?: string;
};

function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "mb-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary",
        className
      )}
    >
      {children}
    </h3>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] font-medium text-foreground">
      {children}
    </code>
  );
}

function RuleCard({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-none">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="font-medium text-foreground">{title}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ColumnGrid({
  items,
  tone,
}: {
  items: ColumnItem[];
  tone: "required" | "optional";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80">
      {items.map((item, index) => (
        <div
          key={item.name}
          className={cn(
            "grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4",
            index > 0 && "border-t border-border/70",
            index % 2 === 1 && "bg-muted/25"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[13px] font-semibold text-foreground">
              {item.name}
            </code>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                tone === "required"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              )}
            >
              {tone === "required" ? "Required" : "Optional"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.text}
            </p>
            {item.example && (
              <p className="mt-1 font-mono text-xs text-foreground/80">
                e.g. {item.example}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InputFile({
  disabled,
  onFile,
}: {
  disabled?: boolean;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <input
      type="file"
      accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
      disabled={disabled}
      className="mx-auto block max-w-xs text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      onChange={(e) => onFile(e.target.files?.[0])}
    />
  );
}
