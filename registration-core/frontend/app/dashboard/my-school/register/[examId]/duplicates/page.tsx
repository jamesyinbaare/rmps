"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  listAvailableExams,
  listAllSchoolExams,
  listSchoolDuplicateCandidates,
} from "@/lib/api";
import type {
  DuplicateMatchGroup,
  DuplicateMatchesResponse,
  RegistrationExam,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DuplicateCompareDialog } from "@/components/school/DuplicateCompareDialog";
import {
  ArrowLeft,
  AlertCircle,
  Copy,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

function groupLabel(group: DuplicateMatchGroup): string {
  const names = group.candidates.map((c) => c.name || `${c.firstname} ${c.lastname}`);
  if (names.length <= 2) return names.join(" / ");
  return `${names[0]} + ${names.length - 1} more`;
}

function formatDob(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function ExamDuplicatesPage() {
  const params = useParams();
  const examIdParam = params.examId as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [loadingExam, setLoadingExam] = useState(true);
  const [sameProgramme, setSameProgramme] = useState(false);
  const [sameDob, setSameDob] = useState(true);
  const [result, setResult] = useState<DuplicateMatchesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(examId)) {
      setLoadingExam(false);
      return;
    }
    let cancelled = false;
    async function loadExam() {
      setLoadingExam(true);
      try {
        const [available, all] = await Promise.all([
          listAvailableExams().catch(() => [] as RegistrationExam[]),
          listAllSchoolExams().catch(() => [] as RegistrationExam[]),
        ]);
        const found =
          available.find((e) => e.id === examId) ||
          all.find((e) => e.id === examId) ||
          null;
        if (!cancelled) setExam(found);
      } catch {
        if (!cancelled) setExam(null);
      } finally {
        if (!cancelled) setLoadingExam(false);
      }
    }
    void loadExam();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const fetchDuplicates = useCallback(async () => {
    if (!Number.isFinite(examId)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSchoolDuplicateCandidates(examId, {
        sameProgramme,
        sameDob,
      });
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to find duplicates";
      setError(message);
      setResult(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [examId, sameProgramme, sameDob]);

  useEffect(() => {
    void fetchDuplicates();
  }, [fetchDuplicates]);

  const groups = result?.groups ?? [];
  const totalCandidates = useMemo(
    () => groups.reduce((sum, g) => sum + g.candidates.length, 0),
    [groups]
  );

  function openCompare(index: number) {
    setActiveIndex(index);
    setCompareOpen(true);
  }

  async function handleChanged() {
    if (!Number.isFinite(examId)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSchoolDuplicateCandidates(examId, {
        sameProgramme,
        sameDob,
      });
      setResult(data);
      if (!data.groups.length) {
        setCompareOpen(false);
        setActiveIndex(0);
      } else {
        setActiveIndex((idx) => Math.min(idx, data.groups.length - 1));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to find duplicates";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!Number.isFinite(examId)) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invalid examination.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loadingExam) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" asChild>
            <Link href={`/dashboard/my-school/register/${examId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to registration
            </Link>
          </Button>
        }
        title="Find duplicates"
        subtitle={
          exam
            ? examTitle(exam)
            : "Compare similar registrations for this examination"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void fetchDuplicates()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              checked={sameDob}
              onCheckedChange={setSameDob}
              id="same-dob"
            />
            <label htmlFor="same-dob" className="text-sm">
              Same date of birth
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={sameProgramme}
              onCheckedChange={setSameProgramme}
              id="same-programme"
            />
            <label htmlFor="same-programme" className="text-sm">
              Same programme only
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {loading ? (
            "Scanning…"
          ) : (
            <>
              {groups.length} group{groups.length === 1 ? "" : "s"} ·{" "}
              {totalCandidates} candidate{totalCandidates === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      <Alert>
        <Copy className="h-4 w-4" />
        <AlertDescription>
          We look for similar names — spelling and name order don&apos;t have to
          match exactly
          {sameDob ? ", and the same date of birth" : ""}
          {sameProgramme ? ", on the same programme" : ""}. Click a group to
          review them side by side.           You can remove a duplicate while registration is open.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !result ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Copy className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No likely duplicates found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting the date-of-birth or programme filters, or refresh
            after new registrations.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidates</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group, index) => {
                const dob = group.candidates[0]?.date_of_birth ?? null;
                const programmes = Array.from(
                  new Set(
                    group.candidates
                      .map((c) => c.programme_code)
                      .filter(Boolean) as string[]
                  )
                );
                const scorePct = Math.round(
                  Math.min(1, Math.max(0, group.best_score)) * 100
                );
                return (
                  <TableRow
                    key={group.group_id}
                    className="cursor-pointer"
                    onClick={() => openCompare(index)}
                  >
                    <TableCell>
                      <div className="font-medium">{groupLabel(group)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.candidates.length} registrations ·{" "}
                        {group.candidates
                          .map((c) => c.registration_number)
                          .join(", ")}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDob(dob)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {programmes.length ? programmes.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{scorePct}%</Badge>
                        {group.match_reasons.map((r) => (
                          <Badge key={r} variant="outline" className="text-xs">
                            {r.replace("_", " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DuplicateCompareDialog
        open={compareOpen}
        onOpenChange={(open) => {
          setCompareOpen(open);
          if (!open) return;
        }}
        groups={groups}
        activeIndex={Math.min(
          activeIndex,
          Math.max(0, groups.length - 1)
        )}
        onActiveIndexChange={setActiveIndex}
        onChanged={handleChanged}
      />
    </div>
  );
}
