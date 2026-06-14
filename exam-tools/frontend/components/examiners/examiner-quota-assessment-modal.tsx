"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { FormSection, OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuotaAssessmentResponse, Subject } from "@/lib/api";
import { assessExaminerQuotaUpload } from "@/lib/api";
import { downloadExaminationExaminersBulkTemplate } from "@/lib/allocation-examiners-upload";
import { formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  examId: number | null;
  subjects: Subject[];
  onOpenChange: (open: boolean) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UtilizationBar({
  combined,
  quota,
  overCap,
}: {
  combined: number;
  quota: number | null | undefined;
  overCap: boolean;
}) {
  if (quota == null || quota <= 0) {
    return <span className="text-xs text-muted-foreground">No cap set</span>;
  }
  const pct = Math.min(100, Math.round((combined / quota) * 100));
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            overCap ? "bg-destructive" : pct >= 90 ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={cn("text-[10px] tabular-nums", overCap ? "text-destructive" : "text-muted-foreground")}>
        {combined}/{quota}
        {overCap ? ` (+${combined - quota})` : quota - combined > 0 ? ` · ${quota - combined} left` : ""}
      </span>
    </div>
  );
}

type AssessmentTableRow = QuotaAssessmentResponse["summary_by_group"][number] | NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number];

function QuotaAssessmentTable({
  rows,
  showRole,
  genderMode = false,
}: {
  rows: AssessmentTableRow[];
  showRole: boolean;
  genderMode?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2">{genderMode ? "Gender" : "Region group"}</th>
              {showRole ? <th className="px-3 py-2">Role</th> : null}
              <th className="px-3 py-2 text-right">Cap</th>
              <th className="px-3 py-2 text-right">Quota %</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">+Upload</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2">Fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const label = genderMode
                ? (row as NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number]).gender_label
                : (row as QuotaAssessmentResponse["summary_by_group"][number]).group_name;
              const roleLabel = !genderMode && showRole
                ? (row as QuotaAssessmentResponse["summary_by_group"][number]).examiner_type_label
                : null;
              const rowKey = genderMode
                ? (row as NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number]).gender
                : `${(row as QuotaAssessmentResponse["summary_by_group"][number]).group_id}-${(row as QuotaAssessmentResponse["summary_by_group"][number]).examiner_type ?? "total"}`;
              return (
                <tr key={rowKey} className={cn(row.over_cap && "bg-destructive/5")}>
                  <td className="px-3 py-2 font-medium">{label}</td>
                  {showRole ? <td className="px-3 py-2 text-muted-foreground">{roleLabel}</td> : null}
                  <td className="px-3 py-2 text-right tabular-nums">{row.quota ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatQuotaPercent(row.quota_percent)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.current_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">+{row.proposed_count}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-medium",
                      row.over_cap && "text-destructive",
                    )}
                  >
                    {row.combined_count}
                  </td>
                  <td className="px-3 py-2">
                    <UtilizationBar combined={row.combined_count} quota={row.quota} overCap={row.over_cap} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatQuotaPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function quotaPercentTotal(rows: Array<{ quota_percent?: number | null }>): number {
  return rows.reduce((sum, row) => sum + (row.quota_percent ?? 0), 0);
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
          <QuotaAssessmentTable rows={groupTotalRows} showRole={false} />
        </section>
      ) : null}

      {roleRows.length > 0 ? (
        <section>
          <h3 className="text-sm font-medium text-foreground">Role caps by region</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Only configured role caps are shown. Quota % is within each region group (sums to 100% per group).
          </p>
          <QuotaAssessmentTable rows={roleRows} showRole />
        </section>
      ) : null}

      {genderRows.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-foreground">Nationwide gender caps</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Quota share ({formatQuotaPercent(quotaPercentTotal(genderRows))} allocated)
          </p>
          <QuotaAssessmentTable rows={genderRows} showRole={false} genderMode />
        </section>
      ) : null}
    </div>
  );
}

export function ExaminerQuotaAssessmentModal({ open, examId, subjects, onOpenChange }: Props) {
  const subjectFieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuotaAssessmentResponse | null>(null);

  const subjectOptions = useMemo(
    () =>
      [...subjects]
        .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)))
        .map((s) => ({ value: String(s.id), label: subjectDisplayLabel(s) })),
    [subjects],
  );

  useEffect(() => {
    if (!open) return;
    if (subjectOptions.length === 0) {
      setSubjectId("");
      return;
    }
    setSubjectId((prev) => (subjectOptions.some((o) => o.value === prev) ? prev : subjectOptions[0].value));
  }, [open, subjectOptions]);

  const resetUpload = useCallback(() => {
    setFile(null);
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    resetUpload();
    onOpenChange(false);
  }, [onOpenChange, resetUpload]);

  const pickFile = useCallback((next: File | null) => {
    setFile(next);
    setResult(null);
    setError(null);
  }, []);

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

  async function handleAssess() {
    if (examId == null || !subjectId || !file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await assessExaminerQuotaUpload(examId, Number(subjectId), file);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  }

  const canAssess = examId != null && subjectId !== "" && file != null && !busy;
  const showSetup = result == null;

  if (!open) return null;

  return (
    <OfficialModal
      title="Test regional quota"
      subtitle="Dry-run a proposed examiner list against configured caps. Nothing is saved."
      titleId="quota-assessment-title"
      subtitleId="quota-assessment-subtitle"
      onRequestClose={handleClose}
      formError={error}
      size="wide"
      footer={
        <div className={officialModalFooterClass()}>
          <Button type="button" variant="outline" className={officialAccountsBtnSecondary} onClick={handleClose}>
            Close
          </Button>
          {showSetup ? (
            <Button
              type="button"
              className={officialAccountsBtnPrimary}
              disabled={!canAssess}
              onClick={() => void handleAssess()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Checking quotas…
                </>
              ) : (
                "Run assessment"
              )}
            </Button>
          ) : (
            <Button type="button" className={officialAccountsBtnPrimary} onClick={resetUpload}>
              <RotateCcw className="mr-2 size-4" />
              Test another file
            </Button>
          )}
        </div>
      }
    >
      {subjectOptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No subjects available</p>
          <p className="mt-1 text-sm text-muted-foreground">Add subjects to this examination before testing quotas.</p>
        </div>
      ) : showSetup ? (
        <div className="space-y-6">
          <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">File format</p>
              <p className="mt-1">
                Use the roster bulk template.{" "}
                <span className="font-mono text-xs">subject_code</span> = original code (e.g. MATH301);{" "}
                <span className="font-mono text-xs">examiner_type</span> = CE, ACE, AE, or TL; optional gender.
              </p>
            </div>
          </div>

          <FormSection title="Setup">
            <div className="md:col-span-2">
              <label className={formLabelClass} id={`${subjectFieldId}-label`}>
                Subject to check
              </label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Quotas are evaluated for this subject only. Rows for other subjects are ignored.
              </p>
              <SearchableCombobox
                id={subjectFieldId}
                options={subjectOptions}
                value={subjectId}
                onChange={(v) => {
                  setSubjectId(v);
                  setResult(null);
                }}
                placeholder="Select subject…"
                searchPlaceholder="Search subject…"
                widthClass="w-full"
                showAllOption={false}
                disabled={busy}
              />
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
              Pick subject
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                2
              </span>
              Upload file
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                3
              </span>
              Run assessment
            </li>
          </ol>
        </div>
      ) : (
        <AssessmentResults result={result} onTestAnother={resetUpload} />
      )}
    </OfficialModal>
  );
}
