"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FormSection } from "@/components/official-modal";
import {
  ExaminerQuotaProjectionTable,
  formatQuotaPercent,
  quotaPercentTotal,
} from "@/components/examiners/examiner-quota-projection-table";
import { ExaminerQuotaUploadRunningView } from "@/components/examiners/examiner-quota-upload-running";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuotaAssessmentResponse } from "@/lib/api";
import { assessExaminerQuotaUpload } from "@/lib/api";
import { downloadExaminationExaminersBulkTemplate } from "@/lib/allocation-examiners-upload";
import { formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

export type QuotaUploadFooterState = {
  busy: boolean;
  canAssess: boolean;
  showSetup: boolean;
  runAssess: () => void;
  resetUpload: () => void;
};

type Props = {
  examId: number | null;
  subjectId: number | null;
  subjectLabel: string | null;
  active: boolean;
  onError: (message: string | null) => void;
  onFooterStateChange: (state: QuotaUploadFooterState | null) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssessmentResults({ result, onTestAnother }: { result: QuotaAssessmentResponse; onTestAnother: () => void }) {
  const groupTotalRows = result.summary_by_group.filter((r) => r.examiner_type == null);
  const roleRows = result.summary_by_group.filter((r) => r.examiner_type != null);
  const genderRows = result.summary_by_gender ?? [];
  const overCapRows = result.summary_by_group.filter((r) => r.over_cap);
  const overCapGender = genderRows.filter((r) => r.over_cap);
  const hasParseErrors = result.row_errors.length > 0;
  const hasViolations = result.violations.length > 0;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex gap-3 rounded-xl border p-4",
          result.valid
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5",
        )}
      >
        <div className="shrink-0 pt-0.5">
          {result.valid ? (
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
          ) : (
            <AlertCircle className="size-5 text-amber-600" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className={cn("font-medium", result.valid ? "text-emerald-900" : "text-amber-950")}>
              {result.valid ? "Within quotas" : "Quota issues found"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {result.valid
                ? `All ${result.proposed_count} proposed row(s) fit the configured caps for this subject.`
                : "Review the breakdown below. Nothing was saved to the roster."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="font-normal">
              {result.proposed_count} row{result.proposed_count === 1 ? "" : "s"} in file
            </Badge>
            {overCapRows.length + overCapGender.length > 0 ? (
              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 font-normal text-destructive">
                {overCapRows.length + overCapGender.length} over cap
              </Badge>
            ) : null}
            {hasParseErrors ? (
              <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
                {result.row_errors.length} parse error{result.row_errors.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {hasViolations ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <h3 className="text-sm font-medium text-destructive">Quota violations</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-destructive/90">
            {result.violations.map((v) => (
              <li key={v} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasParseErrors ? (
        <section className="rounded-lg border border-border bg-muted/30 p-3">
          <h3 className="text-sm font-medium text-foreground">Spreadsheet errors</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Fix these rows in your file before uploading to the roster.</p>
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-sm">
            {result.row_errors.map((r) => (
              <li key={`${r.row_number}-${r.message}`} className="font-mono text-xs text-destructive">
                Row {r.row_number}: {r.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groupTotalRows.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Regional group caps</h3>
              <p className="text-xs text-muted-foreground">
                Quota share across groups ({formatQuotaPercent(quotaPercentTotal(groupTotalRows))} allocated)
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onTestAnother}>
              <RotateCcw className="size-3.5" />
              Test another file
            </Button>
          </div>
          <ExaminerQuotaProjectionTable rows={groupTotalRows} showRole={false} />
        </section>
      ) : null}

      {roleRows.length > 0 ? (
        <section>
          <h3 className="text-sm font-medium text-foreground">Role caps by region</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Only configured role caps are shown. Quota % is within each region group (sums to 100% per group).
          </p>
          <ExaminerQuotaProjectionTable rows={roleRows} showRole />
        </section>
      ) : null}

      {genderRows.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-foreground">Nationwide gender caps</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Quota share ({formatQuotaPercent(quotaPercentTotal(genderRows))} allocated)
          </p>
          <ExaminerQuotaProjectionTable rows={genderRows} showRole={false} genderMode />
        </section>
      ) : null}
    </div>
  );
}

export function ExaminerQuotaUploadPanel({
  examId,
  subjectId,
  subjectLabel,
  active,
  onError,
  onFooterStateChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuotaAssessmentResponse | null>(null);

  const resetUpload = useCallback(() => {
    setFile(null);
    setResult(null);
    onError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [onError]);

  useEffect(() => {
    if (!active) {
      resetUpload();
      onFooterStateChange(null);
    }
  }, [active, onFooterStateChange, resetUpload]);

  const pickFile = useCallback(
    (next: File | null) => {
      setFile(next);
      setResult(null);
      onError(null);
    },
    [onError],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      pickFile(e.target.files?.[0] ?? null);
    },
    [pickFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) pickFile(dropped);
    },
    [pickFile],
  );

  const handleAssess = useCallback(async () => {
    if (examId == null || subjectId == null || !file) return;
    setBusy(true);
    onError(null);
    try {
      const res = await assessExaminerQuotaUpload(examId, subjectId, file);
      setResult(res);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  }, [examId, file, onError, subjectId]);

  const canAssess = examId != null && subjectId != null && file != null && !busy;
  const showSetup = result == null;

  useEffect(() => {
    if (!active) return;
    onFooterStateChange({
      busy,
      canAssess,
      showSetup,
      runAssess: () => void handleAssess(),
      resetUpload,
    });
  }, [active, busy, canAssess, handleAssess, onFooterStateChange, resetUpload, showSetup]);

  if (!active) return null;

  if (subjectId == null) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">Select a subject</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a subject on the roster before testing an upload against quotas.
        </p>
      </div>
    );
  }

  if (!showSetup && result) {
    return <AssessmentResults result={result} onTestAnother={resetUpload} />;
  }

  if (busy && file) {
    return (
      <ExaminerQuotaUploadRunningView
        fileName={file.name}
        subjectLabel={subjectLabel ?? `Subject #${subjectId}`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Dry-run upload</p>
          <p className="mt-1">
            Test a proposed roster file against configured caps. Nothing is saved. Use the roster bulk template —{" "}
            <span className="font-mono text-xs">subject_code</span>,{" "}
            <span className="font-mono text-xs">examiner_type</span> (CE, ACE, AE, TL), optional gender.
          </p>
        </div>
      </div>

      <FormSection title="Upload">
        <div className="md:col-span-2">
          <label className={formLabelClass}>Subject</label>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Quotas are evaluated for this subject only. Rows for other subjects are ignored.
          </p>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
            {subjectLabel ?? `Subject #${subjectId}`}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className={formLabelClass}>Proposed roster file</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={examId == null || busy}
              onClick={() => examId != null && void downloadExaminationExaminersBulkTemplate(examId)}
            >
              <Download className="size-3.5" />
              Download template
            </Button>
          </div>

          <div
            className={cn(
              "mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : file
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border bg-muted/20 hover:border-muted-foreground/30",
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={handleFileInput}
            />

            {file ? (
              <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <FileSpreadsheet className="size-6 text-emerald-700" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace file
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={busy}
                    onClick={resetUpload}
                  >
                    <X className="mr-1 size-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Upload className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Drop your file here</p>
                <p className="mt-0.5 text-xs text-muted-foreground">CSV or Excel (.xlsx)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </Button>
              </>
            )}
          </div>
        </div>
      </FormSection>

      <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
          <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
            1
          </span>
          Upload file
        </li>
        <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
          <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
            2
          </span>
          Run assessment
        </li>
      </ol>
    </div>
  );
}
