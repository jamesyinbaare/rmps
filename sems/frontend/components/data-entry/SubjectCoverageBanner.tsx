"use client";

import Link from "next/link";
import { ExternalLink, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SubjectCoverageStats {
  expected: number;
  uploaded: number;
  missing: number;
  missingObj?: number;
  missingEssay?: number;
  missingPract?: number;
}

interface SubjectCoverageBannerProps {
  stats: SubjectCoverageStats | null;
  loading?: boolean;
  error?: string | null;
  trackHref: string;
  className?: string;
}

export function SubjectCoverageBanner({
  stats,
  loading,
  error,
  trackHref,
  className,
}: SubjectCoverageBannerProps) {
  if (loading && !stats) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking expected sheets for this subject…
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive",
          className
        )}
      >
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const pct =
    stats.expected > 0 ? Math.round((stats.uploaded / stats.expected) * 1000) / 10 : 0;
  const breakdown: string[] = [];
  if ((stats.missingObj ?? 0) > 0) breakdown.push(`${stats.missingObj} obj`);
  if ((stats.missingEssay ?? 0) > 0) breakdown.push(`${stats.missingEssay} essay`);
  if ((stats.missingPract ?? 0) > 0) breakdown.push(`${stats.missingPract} pract`);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {stats.missing > 0 ? (
          <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : null}
        <span className="font-medium">
          {stats.uploaded.toLocaleString()} / {stats.expected.toLocaleString()} uploaded
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums text-muted-foreground">{pct}% coverage</span>
        {stats.missing > 0 ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums font-medium text-amber-700 dark:text-amber-400">
              {stats.missing.toLocaleString()} missing
              {breakdown.length > 0 ? ` (${breakdown.join(", ")})` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">All expected sheets uploaded</span>
          </>
        )}
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
      {stats.missing > 0 ? (
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
          <Link href={trackHref}>
            View missing
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
          <Link href={trackHref}>
            Track ICMS
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}
