"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveCandidatePhoto, getExamRegistrationResultDetail, getPhotoFile } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CandidateResultSummary,
  ExamRegistrationResultDetail,
} from "@/types/document";
import { ChevronLeft, ChevronRight, Loader2, User } from "lucide-react";
import {
  CandidateResultDetail,
  type ResultDetailTab,
} from "./CandidateResultDetail";

interface CandidateResultModalProps {
  examId: number;
  registrationId: number | null;
  candidates: CandidateResultSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistrationChange: (registrationId: number) => void;
}

function formatBirthDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function programmeLabel(row: Pick<CandidateResultSummary, "programme_code" | "programme_name">) {
  if (row.programme_code && row.programme_name) {
    return `${row.programme_code} — ${row.programme_name}`;
  }
  return row.programme_name || row.programme_code || null;
}

function PassportPhoto({
  url,
  loading,
  name,
}: {
  url: string | null;
  loading: boolean;
  name: string;
}) {
  return (
    <div className="relative h-[148px] w-[112px] shrink-0 overflow-hidden rounded-md border bg-muted shadow-sm">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Passport photo of ${name}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <User className="h-8 w-8 opacity-40" />
              <span className="px-2 text-center text-[10px] font-medium uppercase tracking-wide">
                No photo
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CandidateResultModal({
  examId,
  registrationId,
  candidates,
  open,
  onOpenChange,
  onRegistrationChange,
}: CandidateResultModalProps) {
  const [detail, setDetail] = useState<ExamRegistrationResultDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ResultDetailTab>("grades");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const currentIndex = candidates.findIndex(
    (c) => c.exam_registration_id === registrationId
  );
  const current = currentIndex >= 0 ? candidates[currentIndex] : null;
  const canPrevious = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < candidates.length - 1;
  const candidateId = detail?.candidate_id ?? current?.candidate_id;

  const goPrevious = () => {
    if (canPrevious) onRegistrationChange(candidates[currentIndex - 1].exam_registration_id);
  };
  const goNext = () => {
    if (canNext) onRegistrationChange(candidates[currentIndex + 1].exam_registration_id);
  };

  useEffect(() => {
    if (!open) {
      setTab("grades");
      setDetail(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !registrationId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    getExamRegistrationResultDetail(registrationId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : "Failed to load result detail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, registrationId]);

  useEffect(() => {
    if (!open || !candidateId) {
      setPhotoUrl(null);
      setPhotoLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPhotoLoading(true);
    setPhotoUrl(null);

    getActiveCandidatePhoto(candidateId)
      .then(async (photo) => {
        if (cancelled || !photo) return null;
        return getPhotoFile(candidateId, photo.id);
      })
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPhotoLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, candidateId]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, currentIndex, candidates, canPrevious, canNext]);

  const name = detail?.candidate_name ?? current?.candidate_name ?? "Candidate results";
  const indexNumber = detail?.index_number ?? current?.index_number;
  const programme = detail
    ? programmeLabel(detail)
    : current
      ? programmeLabel(current)
      : null;
  const isReady = detail?.is_fully_graded ?? current?.is_fully_graded;
  const school =
    detail?.school_code && detail.school_name
      ? `${detail.school_code} — ${detail.school_name}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(48rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex gap-4">
            <PassportPhoto url={photoUrl} loading={photoLoading} name={name} />

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-xl leading-tight">{name}</DialogTitle>
                  <DialogDescription className="mt-1 font-mono text-sm">
                    {indexNumber ?? "—"}
                  </DialogDescription>
                </div>
                {isReady != null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      isReady
                        ? "border-transparent bg-emerald-600 text-white"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    )}
                  >
                    {isReady ? "Ready" : "Pending"}
                  </Badge>
                )}
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Programme</dt>
                  <dd className="truncate font-medium">{programme || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">School</dt>
                  <dd className="truncate font-medium">{school || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Gender</dt>
                  <dd className="font-medium">{detail?.gender || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Date of birth</dt>
                  <dd className="font-medium">
                    {detail?.date_of_birth ? formatBirthDate(detail.date_of_birth) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-muted">
              <div className="h-full w-1/3 animate-pulse bg-primary" />
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && !detail ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className={cn(loading && "opacity-70")}>
              <CandidateResultDetail detail={detail} tab={tab} onTabChange={setTab} />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!canPrevious}
              onClick={goPrevious}
              aria-label="Previous candidate"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!canNext}
              onClick={goNext}
              aria-label="Next candidate"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {currentIndex >= 0 ? `${currentIndex + 1} of ${candidates.length}` : ""}
              <span className="hidden sm:inline"> · ← →</span>
            </span>
          </div>
          {registrationId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/results/certificates/${examId}/registrations/${registrationId}`}>
                Manage certificate
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
