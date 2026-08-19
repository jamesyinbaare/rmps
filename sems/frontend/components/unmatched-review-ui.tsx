import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UnmatchedExtractionRecord, UnmatchedIndexMatch } from "@/types/document";

export function HighlightedIndex({
  highlight,
  fallback,
  className,
}: {
  highlight?: Array<[string, boolean]>;
  fallback: string;
  className?: string;
}) {
  if (!highlight?.length) {
    return <span className={cn("font-mono", className)}>{fallback}</span>;
  }
  return (
    <span className={cn("font-mono", className)}>
      {highlight.map(([chunk, isNoise], i) => (
        <span
          key={`${chunk}-${i}`}
          className={
            isNoise
              ? "bg-destructive/20 text-destructive line-through decoration-destructive/60"
              : undefined
          }
        >
          {chunk}
        </span>
      ))}
    </span>
  );
}

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function namesDiffer(
  extracted: string | null | undefined,
  suggested: string | null | undefined
): boolean {
  const left = normalizeName(extracted);
  const right = normalizeName(suggested);
  if (!left || !right) return false;
  return left !== right;
}

export function scoreFieldLabel(field: "obj" | "essay" | "pract" | null | undefined): string {
  if (field === "obj") return "Objectives";
  if (field === "essay") return "Essay";
  if (field === "pract") return "Practical";
  return "Unknown paper";
}

export function documentContextLabel(record: UnmatchedExtractionRecord): string {
  return [
    record.document_school_name,
    record.document_subject_name,
    record.document_extracted_id ?? `Doc ${record.document_id}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function matchHasNameDiff(
  record: UnmatchedExtractionRecord,
  match?: UnmatchedIndexMatch | null
): boolean {
  return namesDiffer(record.candidate_name, match?.candidate_name);
}

export function matchHasScoreOverwrite(match?: UnmatchedIndexMatch | null): boolean {
  return Boolean(match?.current_score);
}

export function isOcrException(record: UnmatchedExtractionRecord): boolean {
  const match = record.suggestion?.matches[0];
  return matchHasNameDiff(record, match) || matchHasScoreOverwrite(match);
}

export function NameDiffersBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-800 dark:text-amber-400",
        className
      )}
    >
      Name differs
    </Badge>
  );
}

export function OverwritesScoreBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-destructive/40 bg-destructive/10 text-[10px] text-destructive",
        className
      )}
    >
      Overwrites score
    </Badge>
  );
}

export function OcrNoiseBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-amber-500/40 text-[10px] text-amber-800 dark:text-amber-400", className)}
    >
      OCR noise cleaned
    </Badge>
  );
}

export function MatchWarningBadges({
  record,
  match,
}: {
  record: UnmatchedExtractionRecord;
  match?: UnmatchedIndexMatch | null;
}) {
  const nameMismatch = matchHasNameDiff(record, match);
  const overwrite = matchHasScoreOverwrite(match);
  const ocrNoise = Boolean(record.suggestion?.likely_ocr_noise);
  if (!nameMismatch && !overwrite && !ocrNoise) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ocrNoise ? <OcrNoiseBadge /> : null}
      {nameMismatch ? <NameDiffersBadge /> : null}
      {overwrite ? <OverwritesScoreBadge /> : null}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export type DiffRun = { text: string; changed: boolean };

function coalesceRuns(runs: DiffRun[]): DiffRun[] {
  const out: DiffRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && last.changed === run.changed) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

function charDiff(left: string, right: string): { left: DiffRun[]; right: DiffRun[] } {
  const a = Array.from(left);
  const b = Array.from(right);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1].toLowerCase() === b[j - 1].toLowerCase()
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const leftRuns: DiffRun[] = [];
  const rightRuns: DiffRun[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      leftRuns.push({ text: a[i - 1], changed: false });
      rightRuns.push({ text: b[j - 1], changed: false });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rightRuns.push({ text: b[j - 1], changed: true });
      j -= 1;
    } else {
      leftRuns.push({ text: a[i - 1], changed: true });
      i -= 1;
    }
  }
  leftRuns.reverse();
  rightRuns.reverse();
  return { left: coalesceRuns(leftRuns), right: coalesceRuns(rightRuns) };
}

export function DiffName({
  value,
  other,
  side,
  className,
}: {
  value: string | null | undefined;
  other: string | null | undefined;
  side: "left" | "right";
  className?: string;
}) {
  const left = (value ?? "").trim() || "—";
  const right = (other ?? "").trim() || "—";
  const runs = namesDiffer(value, other)
    ? side === "left"
      ? charDiff(left, right).left
      : charDiff(left, right).right
    : [{ text: side === "left" ? left : right, changed: false }];

  return (
    <span className={cn("wrap-break-word", className)}>
      {runs.map((run, i) => (
        <span
          key={`${run.text}-${i}`}
          className={
            run.changed
              ? side === "left"
                ? "bg-amber-500/20 text-amber-900 dark:text-amber-300"
                : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-300"
              : undefined
          }
        >
          {run.text}
        </span>
      ))}
    </span>
  );
}
