"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Eraser,
  FileWarning,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserX,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { BulkUpdateScoresFromReductoResult } from "@/lib/api";
import type {
  SkippedVerifyRecord,
  UnmatchedApplyRecord,
  UpdateScoresFromReductoResponse,
} from "@/types/document";
import { paperLabel } from "@/components/data-entry/score-entry-utils";

export type ApplyScoresSheetMeta = {
  id: number;
  extracted_id: string | null;
  school_name: string | null;
  subject_code?: string | null;
  subject_name?: string | null;
  test_type: string | null;
};

export type ApplyScoresResult = {
  providerLabel: string;
  verifyEnabled: boolean;
  documents_processed: number;
  documents_succeeded: number;
  documents_failed: number;
  updated_count: number;
  unmatched_count: number;
  skipped_count: number;
  cleared_count: number;
  skipped_records: SkippedVerifyRecord[];
  unmatched_records: UnmatchedApplyRecord[];
  errors: Array<{ document_id: number; error: string }>;
  sheets: ApplyScoresSheetMeta[];
};

export function sheetMetaFromDocument(doc: ApplyScoresSheetMeta): ApplyScoresSheetMeta {
  return {
    id: doc.id,
    extracted_id: doc.extracted_id,
    school_name: doc.school_name,
    subject_code: doc.subject_code,
    subject_name: doc.subject_name,
    test_type: doc.test_type,
  };
}

export function applyResultFromBulk(
  result: BulkUpdateScoresFromReductoResult,
  meta: {
    providerLabel: string;
    verifyEnabled: boolean;
    sheets?: ApplyScoresSheetMeta[];
  }
): ApplyScoresResult {
  return { ...result, ...meta, sheets: meta.sheets ?? [] };
}

export function applyResultFromSingle(
  response: UpdateScoresFromReductoResponse,
  documentId: number,
  meta: {
    providerLabel: string;
    verifyEnabled: boolean;
    sheets?: ApplyScoresSheetMeta[];
  }
): ApplyScoresResult {
  return {
    ...meta,
    documents_processed: 1,
    documents_succeeded: 1,
    documents_failed: 0,
    updated_count: response.updated_count,
    unmatched_count: response.unmatched_count,
    skipped_count: response.skipped_count ?? 0,
    cleared_count: response.cleared_count ?? 0,
    skipped_records: (response.skipped_records ?? []).map((row) => ({
      ...row,
      document_id: documentId,
    })),
    unmatched_records: (response.unmatched_records ?? []).map((row) => ({
      ...row,
      document_id: documentId,
    })),
    errors: (response.errors ?? []).map((entry) => {
      const index = entry.index_number;
      const message =
        entry.error ??
        Object.values(entry).find((value) => value && value !== index) ??
        "Unknown error";
      return {
        document_id: documentId,
        error: index ? `${index}: ${message}` : message,
      };
    }),
    sheets: meta.sheets ?? [],
  };
}

type Outcome = "success" | "mixed" | "failed";
type IssueTab = "skipped" | "unmatched" | "errors";

function outcomeOf(result: ApplyScoresResult): Outcome {
  if (result.documents_failed > 0 && result.updated_count === 0) return "failed";
  if (
    result.skipped_count > 0 ||
    result.unmatched_count > 0 ||
    result.documents_failed > 0 ||
    result.errors.length > 0
  ) {
    return "mixed";
  }
  return "success";
}

const OUTCOME_COPY: Record<
  Outcome,
  {
    title: string;
    Icon: ComponentType<{ className?: string }>;
    iconWell: string;
    header: string;
    glow: string;
    ring: string;
  }
> = {
  success: {
    title: "Scores applied",
    Icon: CheckCircle2,
    iconWell: "bg-emerald-500 text-white shadow-emerald-500/30 shadow-lg",
    header: "from-emerald-500/20 via-background to-background",
    glow: "bg-emerald-400/30",
    ring: "ring-emerald-500/20",
  },
  mixed: {
    title: "Applied with issues",
    Icon: AlertTriangle,
    iconWell: "bg-amber-500 text-white shadow-amber-500/30 shadow-lg",
    header: "from-amber-500/20 via-background to-background",
    glow: "bg-amber-400/30",
    ring: "ring-amber-500/20",
  },
  failed: {
    title: "Apply failed",
    Icon: XCircle,
    iconWell: "bg-destructive text-white shadow-destructive/30 shadow-lg",
    header: "from-destructive/20 via-background to-background",
    glow: "bg-destructive/25",
    ring: "ring-destructive/20",
  },
};

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function formatValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function outcomeSummary(result: ApplyScoresResult, outcome: Outcome) {
  const sheets = plural(result.documents_processed, "sheet", "sheets");
  if (outcome === "failed") {
    return `None of the ${sheets} could be applied with ${result.providerLabel}.`;
  }
  const wrote = plural(result.updated_count, "score", "scores");
  if (outcome === "success") {
    return `Wrote ${wrote} from ${result.providerLabel} across ${sheets}. Every row matched.`;
  }
  const issues: string[] = [];
  if (result.skipped_count > 0) {
    issues.push(plural(result.skipped_count, "verify mismatch", "verify mismatches"));
  }
  if (result.unmatched_count > 0) {
    issues.push(plural(result.unmatched_count, "unmatched candidate", "unmatched candidates"));
  }
  if (result.documents_failed > 0) {
    issues.push(plural(result.documents_failed, "failed sheet", "failed sheets"));
  }
  return `Wrote ${wrote} from ${result.providerLabel} across ${sheets}. ${issues.join(" · ")}.`;
}

function sheetLookup(sheets: ApplyScoresSheetMeta[]) {
  return new Map(sheets.map((sheet) => [sheet.id, sheet]));
}

function sheetTitle(sheet: ApplyScoresSheetMeta | undefined, documentId?: number) {
  if (sheet?.extracted_id) return sheet.extracted_id;
  if (documentId != null) return `Document ${documentId}`;
  return "Unknown sheet";
}

function sheetCaption(sheet: ApplyScoresSheetMeta | undefined) {
  if (!sheet) return null;
  const paper = sheet.test_type ? paperLabel(sheet.test_type) : null;
  const subject = [sheet.subject_code, sheet.subject_name].filter(Boolean).join(" ");
  const parts = [sheet.school_name, subject || null, paper].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function MixBar({
  applied,
  skipped,
  unmatched,
  failed,
}: {
  applied: number;
  skipped: number;
  unmatched: number;
  failed: number;
}) {
  const total = applied + skipped + unmatched + failed;
  if (total === 0) return null;
  const segments = [
    { n: applied, className: "bg-emerald-500", label: "Applied" },
    { n: skipped, className: "bg-amber-500", label: "Skipped" },
    { n: unmatched, className: "bg-orange-500", label: "Unmatched" },
    { n: failed, className: "bg-red-500", label: "Failed" },
  ].filter((segment) => segment.n > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn("h-full transition-all duration-500", segment.className)}
            style={{ width: `${(segment.n / total) * 100}%` }}
            title={`${segment.label}: ${segment.n}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", segment.className)} />
            {segment.label}
            <span className="tabular-nums font-medium text-foreground">{segment.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiTile({
  title,
  value,
  caption,
  icon: Icon,
  accent,
  iconWell,
  valueClass,
  active,
  onClick,
}: {
  title: string;
  value: number;
  caption: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  iconWell: string;
  valueClass?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "animate-in fade-in-0 rounded-xl border border-transparent border-l-4 bg-card p-3.5 text-left shadow-sm duration-200",
        accent,
        onClick && "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md",
        active && "ring-2 ring-primary/25"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className={cn("rounded-md p-1", iconWell)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", valueClass)}>
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{caption}</p>
    </Comp>
  );
}

function ScoreCompare({
  score,
  verify,
}: {
  score: string | number | null;
  verify: string | number | null;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border bg-background text-center shadow-xs">
      <div className="min-w-14 px-2.5 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Score
        </p>
        <p className="font-mono text-sm font-semibold tabular-nums">{formatValue(score)}</p>
      </div>
      <div className="flex items-center bg-muted/60 px-1 text-xs text-muted-foreground">≠</div>
      <div className="min-w-14 px-2.5 py-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Verify
        </p>
        <p className="font-mono text-sm font-semibold tabular-nums">{formatValue(verify)}</p>
      </div>
    </div>
  );
}

function RecordCard({
  eyebrow,
  title,
  subtitle,
  trailing,
}: {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  trailing: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/80 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        {eyebrow ? (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        ) : null}
        <p className="truncate font-mono text-sm font-semibold tracking-tight">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div>
    </div>
  );
}

function SheetGroup({
  documentId,
  sheets,
  showHeader,
  children,
}: {
  documentId?: number;
  sheets: Map<number, ApplyScoresSheetMeta>;
  showHeader: boolean;
  children: ReactNode;
}) {
  const sheet = documentId != null ? sheets.get(documentId) : undefined;
  return (
    <div className="space-y-1.5">
      {showHeader ? (
        <div className="flex items-baseline justify-between gap-3 px-0.5 pt-1">
          <p className="font-mono text-xs font-medium">{sheetTitle(sheet, documentId)}</p>
          <p className="truncate text-[11px] text-muted-foreground">{sheetCaption(sheet)}</p>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function groupByDocument<T extends { document_id?: number }>(rows: T[]) {
  const groups: Array<{ documentId?: number; rows: T[] }> = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = row.document_id != null ? String(row.document_id) : "unknown";
    const existing = index.get(key);
    if (existing == null) {
      index.set(key, groups.length);
      groups.push({ documentId: row.document_id, rows: [row] });
    } else {
      groups[existing].rows.push(row);
    }
  }
  return groups;
}

export function ApplyScoresResultDialog({
  result,
  open,
  onOpenChange,
}: {
  result: ApplyScoresResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sheets = useMemo(() => sheetLookup(result?.sheets ?? []), [result?.sheets]);
  const issueTabs = useMemo(() => {
    if (!result) return [] as IssueTab[];
    const tabs: IssueTab[] = [];
    if (result.skipped_records.length > 0) tabs.push("skipped");
    if (result.unmatched_records.length > 0) tabs.push("unmatched");
    if (result.errors.length > 0) tabs.push("errors");
    return tabs;
  }, [result]);
  const [tab, setTab] = useState<IssueTab>("skipped");
  const activeTab = issueTabs.includes(tab) ? tab : issueTabs[0];

  if (!result) return null;

  const outcome = outcomeOf(result);
  const copy = OUTCOME_COPY[outcome];
  const StatusIcon = copy.Icon;
  const unmatchedHref = "/scores/unmatched-records";
  const considered = result.updated_count + result.skipped_count + result.unmatched_count;
  const applyRate = considered > 0 ? Math.round((result.updated_count / considered) * 100) : 0;
  const leftBlank = Math.max(0, result.skipped_count - result.cleared_count);
  const skippedGroups = groupByDocument(result.skipped_records);
  const unmatchedGroups = groupByDocument(result.unmatched_records);
  const errorGroups = groupByDocument(result.errors);
  const showSheetHeaders = (result.sheets?.length ?? 0) > 1 || skippedGroups.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader
          className={cn(
            "relative shrink-0 overflow-hidden border-b bg-linear-to-br px-6 py-5 text-left",
            copy.header
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full blur-3xl",
              copy.glow
            )}
          />
          <div className="relative flex items-start gap-4 pr-6">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-4",
                copy.iconWell,
                copy.ring
              )}
            >
              <StatusIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-2.5">
              <div className="space-y-1">
                <DialogTitle className="text-xl tracking-tight">{copy.title}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  {outcomeSummary(result, outcome)}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{result.providerLabel}</Badge>
                <Badge
                  variant="outline"
                  className={
                    result.verifyEnabled
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }
                >
                  {result.verifyEnabled ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldOff className="h-3 w-3" />
                  )}
                  {result.verifyEnabled ? "Verify required" : "Verify off"}
                </Badge>
                <Badge variant="outline">
                  {result.documents_succeeded}/{result.documents_processed} sheets
                </Badge>
                {considered > 0 ? (
                  <Badge variant="outline" className="tabular-nums">
                    {applyRate}% written
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <MixBar
            applied={result.updated_count}
            skipped={result.skipped_count}
            unmatched={result.unmatched_count}
            failed={result.documents_failed}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiTile
              title="Applied"
              value={result.updated_count}
              caption={considered > 0 ? `${applyRate}% of extracted rows` : "Scores written"}
              icon={Send}
              accent="border-l-emerald-500"
              iconWell="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              valueClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiTile
              title="Skipped"
              value={result.skipped_count}
              caption={
                result.cleared_count > 0
                  ? `${result.cleared_count} cleared · ${leftBlank} left blank`
                  : "Score ≠ verify"
              }
              icon={ShieldAlert}
              accent="border-l-amber-500"
              iconWell="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              valueClass="text-amber-700 dark:text-amber-400"
              active={activeTab === "skipped"}
              onClick={
                result.skipped_records.length > 0 ? () => setTab("skipped") : undefined
              }
            />
            <KpiTile
              title="Unmatched"
              value={result.unmatched_count}
              caption="No candidate on file"
              icon={UserX}
              accent="border-l-orange-500"
              iconWell="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              valueClass="text-orange-700 dark:text-orange-400"
              active={activeTab === "unmatched"}
              onClick={
                result.unmatched_records.length > 0 ? () => setTab("unmatched") : undefined
              }
            />
            <KpiTile
              title="Failed"
              value={result.documents_failed}
              caption={plural(result.documents_failed, "sheet errored", "sheets errored")}
              icon={XCircle}
              accent="border-l-red-500"
              iconWell="bg-red-500/10 text-red-600 dark:text-red-400"
              valueClass="text-red-700 dark:text-red-400"
              active={activeTab === "errors"}
              onClick={result.errors.length > 0 ? () => setTab("errors") : undefined}
            />
          </div>

          {outcome === "success" ? (
            <div className="animate-in fade-in-0 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                    All extracted scores were written
                  </p>
                  <p className="text-sm leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
                    {result.verifyEnabled
                      ? "Score and verify matched on every row. No unmatched indexes."
                      : "Scores were written without a verify check. No unmatched indexes."}
                    {result.documents_processed > 1
                      ? ` ${result.documents_succeeded} of ${result.documents_processed} sheets completed.`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setTab(value as IssueTab)}
              className="gap-3"
            >
              <TabsList className="h-9 w-full justify-start">
                {result.skipped_records.length > 0 ? (
                  <TabsTrigger value="skipped" className="gap-1.5 text-xs">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Mismatches
                    <span className="tabular-nums text-muted-foreground">
                      {result.skipped_records.length}
                    </span>
                  </TabsTrigger>
                ) : null}
                {result.unmatched_records.length > 0 ? (
                  <TabsTrigger value="unmatched" className="gap-1.5 text-xs">
                    <UserX className="h-3.5 w-3.5" />
                    Unmatched
                    <span className="tabular-nums text-muted-foreground">
                      {result.unmatched_records.length}
                    </span>
                  </TabsTrigger>
                ) : null}
                {result.errors.length > 0 ? (
                  <TabsTrigger value="errors" className="gap-1.5 text-xs">
                    <FileWarning className="h-3.5 w-3.5" />
                    Errors
                    <span className="tabular-nums text-muted-foreground">
                      {result.errors.length}
                    </span>
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="skipped" className="mt-0 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Score and verify did not match, so the row was not written.
                  {result.cleared_count > 0
                    ? ` ${plural(result.cleared_count, "existing score was", "existing scores were")} cleared.`
                    : ""}
                  {leftBlank > 0
                    ? ` ${plural(leftBlank, "row", "rows")} had no existing score to clear.`
                    : ""}
                </p>
                {skippedGroups.map((group) => (
                  <SheetGroup
                    key={group.documentId ?? "unknown"}
                    documentId={group.documentId}
                    sheets={sheets}
                    showHeader={showSheetHeaders}
                  >
                    {group.rows.map((row, index) => {
                      const sheet = row.document_id != null ? sheets.get(row.document_id) : undefined;
                      return (
                        <RecordCard
                          key={`skip-${row.document_id ?? "doc"}-${row.index_number ?? index}`}
                          eyebrow={showSheetHeaders ? null : sheetCaption(sheet)}
                          title={row.index_number ?? "Unknown index"}
                          subtitle={row.candidate_name || "Unnamed candidate"}
                          trailing={
                            <>
                              <ScoreCompare score={row.score} verify={row.verify} />
                              {row.cleared ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                >
                                  <Eraser className="h-3 w-3" />
                                  Cleared existing
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Not written</Badge>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                  </SheetGroup>
                ))}
              </TabsContent>

              <TabsContent value="unmatched" className="mt-0 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  These indexes were read from the sheet but did not match a registered candidate
                  for this subject.
                </p>
                {unmatchedGroups.map((group) => (
                  <SheetGroup
                    key={group.documentId ?? "unknown"}
                    documentId={group.documentId}
                    sheets={sheets}
                    showHeader={showSheetHeaders || unmatchedGroups.length > 1}
                  >
                    {group.rows.map((row, index) => {
                      const sheet = row.document_id != null ? sheets.get(row.document_id) : undefined;
                      return (
                        <RecordCard
                          key={`unmatch-${row.document_id ?? "doc"}-${row.index_number ?? index}`}
                          eyebrow={
                            showSheetHeaders || unmatchedGroups.length > 1
                              ? null
                              : sheetCaption(sheet)
                          }
                          title={row.index_number ?? "Missing index"}
                          subtitle={row.candidate_name || row.error || "No candidate match"}
                          trailing={
                            <>
                              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-center shadow-xs">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Score
                                </p>
                                <p className="font-mono text-sm font-semibold tabular-nums">
                                  {formatValue(row.score)}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-orange-700 dark:text-orange-300">
                                Unmatched
                              </Badge>
                            </>
                          }
                        />
                      );
                    })}
                  </SheetGroup>
                ))}
              </TabsContent>

              <TabsContent value="errors" className="mt-0 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  These sheets did not apply. Other selected sheets may still have succeeded.
                </p>
                {errorGroups.map((group) => (
                  <SheetGroup
                    key={group.documentId ?? "unknown"}
                    documentId={group.documentId}
                    sheets={sheets}
                    showHeader={showSheetHeaders || errorGroups.length > 1}
                  >
                    {group.rows.map((row, index) => {
                      const sheet = sheets.get(row.document_id);
                      return (
                        <RecordCard
                          key={`err-${row.document_id}-${index}`}
                          eyebrow={sheetCaption(sheet)}
                          title={sheetTitle(sheet, row.document_id)}
                          subtitle={row.error}
                          trailing={<Badge variant="destructive">Failed</Badge>}
                        />
                      );
                    })}
                  </SheetGroup>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4">
          {result.unmatched_count > 0 ? (
            <Button variant="outline" asChild>
              <Link href={unmatchedHref}>Review unmatched</Link>
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
