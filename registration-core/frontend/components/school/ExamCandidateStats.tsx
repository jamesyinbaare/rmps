"use client";

import { useMemo } from "react";
import { BookOpen, Users } from "lucide-react";
import type { RegistrationCandidate } from "@/types";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type NormalizedGender = "male" | "female" | "unspecified";

export function normalizeCandidateGender(
  gender: string | null | undefined
): NormalizedGender {
  if (!gender?.trim()) return "unspecified";
  const g = gender.trim().toUpperCase();
  if (g === "M" || g === "MALE") return "male";
  if (g === "F" || g === "FEMALE") return "female";
  return "unspecified";
}

function GenderProportionBar({
  share,
  tone,
}: {
  share: number;
  tone: "male" | "female";
}) {
  const pct = Math.max(0, Math.min(100, share * 100));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "male" ? "bg-foreground/70" : "bg-foreground/50"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface ExamCandidateStatsProps {
  candidates: RegistrationCandidate[];
  loading?: boolean;
  /** Optional school self-declared expected total for this exam */
  expectedTotal?: number | null;
}

export function ExamCandidateStats({
  candidates,
  loading = false,
  expectedTotal = null,
}: ExamCandidateStatsProps) {
  const stats = useMemo(() => {
    const total = candidates.length;
    let complete = 0;
    let incomplete = 0;
    let draft = 0;
    let male = 0;
    let female = 0;
    let unspecified = 0;
    const programmeKeys = new Set<string>();
    const programmeCounts = new Map<string, number>();

    for (const c of candidates) {
      const status = String(c.registration_status || "").toUpperCase();
      if (status === "COMPLETE") complete += 1;
      else if (status === "INCOMPLETE") incomplete += 1;
      else if (status === "DRAFT") draft += 1;

      const gender = normalizeCandidateGender(c.gender);
      if (gender === "male") male += 1;
      else if (gender === "female") female += 1;
      else unspecified += 1;

      const key =
        c.programme_id != null
          ? `id:${c.programme_id}`
          : c.programme_code
            ? `code:${c.programme_code}`
            : null;
      if (key) {
        programmeKeys.add(key);
        const label = c.programme_code || key;
        programmeCounts.set(label, (programmeCounts.get(label) || 0) + 1);
      }
    }

    let topProgramme: string | null = null;
    let topCount = 0;
    for (const [label, count] of programmeCounts) {
      if (count > topCount) {
        topCount = count;
        topProgramme = label;
      }
    }

    const known = male + female;
    return {
      total,
      complete,
      incomplete,
      draft,
      male,
      female,
      unspecified,
      programmes: programmeKeys.size,
      topProgramme,
      topCount,
      maleShare: known > 0 ? male / known : 0,
      femaleShare: known > 0 ? female / known : 0,
    };
  }, [candidates]);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="space-y-2 border-border p-5 sm:border-l first:border-l-0 md:p-6"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusParts = [
    stats.complete > 0 ? `${stats.complete.toLocaleString()} complete` : null,
    stats.incomplete > 0
      ? `${stats.incomplete.toLocaleString()} incomplete`
      : null,
    stats.draft > 0 ? `${stats.draft.toLocaleString()} draft` : null,
  ].filter(Boolean);

  const expectedHint =
    expectedTotal != null
      ? stats.total > expectedTotal
        ? `Over expected (${stats.total.toLocaleString()} / ${expectedTotal.toLocaleString()})`
        : stats.total < expectedTotal
          ? `Under expected (${stats.total.toLocaleString()} / ${expectedTotal.toLocaleString()})`
          : `On target (${expectedTotal.toLocaleString()} expected)`
      : null;

  const registeredHintParts = [
    expectedHint,
    statusParts.length > 0 ? statusParts.join(" · ") : "No status breakdown yet",
    stats.unspecified > 0
      ? `${stats.unspecified.toLocaleString()} unspecified gender`
      : null,
  ].filter(Boolean);

  const programmeHint =
    stats.programmes === 0
      ? "No programmes assigned"
      : stats.topProgramme
        ? `Most common: ${stats.topProgramme}${
            stats.topCount > 0 ? ` (${stats.topCount})` : ""
          }`
        : `Across ${stats.programmes} programmes`;

  return (
    <StatStrip
      items={[
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {expectedTotal != null ? "Registered / expected" : "Registered"}
            </span>
          ),
          value:
            expectedTotal != null
              ? `${stats.total.toLocaleString()} / ${expectedTotal.toLocaleString()}`
              : stats.total.toLocaleString(),
          hint: registeredHintParts.join(" · "),
        },
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Programmes
            </span>
          ),
          value: stats.programmes.toLocaleString(),
          hint: programmeHint,
        },
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-border text-[10px] font-medium leading-none">
                M
              </span>
              Male
            </span>
          ),
          value: (
            <div>
              <div>{stats.male.toLocaleString()}</div>
              <GenderProportionBar share={stats.maleShare} tone="male" />
            </div>
          ),
          hint:
            stats.male + stats.female > 0
              ? `${Math.round(stats.maleShare * 100)}% of known gender`
              : "No gender data",
        },
        {
          label: (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-border text-[10px] font-medium leading-none">
                F
              </span>
              Female
            </span>
          ),
          value: (
            <div>
              <div>{stats.female.toLocaleString()}</div>
              <GenderProportionBar share={stats.femaleShare} tone="female" />
            </div>
          ),
          hint:
            stats.male + stats.female > 0
              ? `${Math.round(stats.femaleShare * 100)}% of known gender`
              : "No gender data",
        },
      ]}
    />
  );
}
