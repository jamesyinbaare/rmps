"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  apiJson,
  getStaffCentreOverview,
  getStaffDepotOverview,
  type Examination,
} from "@/lib/api";

const DISMISS_KEY = "exam-tools-notice-promo-dismissed";
const DAYS_BEFORE_FIRST = 14;
const DAYS_AFTER_LAST = 7;

function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function collectExamDates(overview: {
  sessions_today?: { examination_date: string }[];
  upcoming: { examination_date: string }[];
}): { first: Date | null; last: Date | null } {
  const keys = new Set<string>();
  for (const s of overview.sessions_today ?? []) keys.add(s.examination_date);
  for (const u of overview.upcoming) keys.add(u.examination_date);
  if (keys.size === 0) return { first: null, last: null };
  const sorted = [...keys].sort();
  return {
    first: parseLocalDay(sorted[0]),
    last: parseLocalDay(sorted[sorted.length - 1]),
  };
}

function shouldShowForWindow(first: Date | null, last: Date | null): boolean {
  const today = startOfLocalDay(new Date());
  if (first == null || last == null) return true;
  const windowStart = startOfLocalDay(addDays(first, -DAYS_BEFORE_FIRST));
  const windowEnd = startOfLocalDay(addDays(last, DAYS_AFTER_LAST));
  return today >= windowStart && today <= windowEnd;
}

type StaffRole = "supervisor" | "inspector" | "depot-keeper";

type Props = {
  staffRole: StaffRole;
  examinationNoticeHref: string;
};

export function ExaminationNoticeSessionBanner({ staffRole, examinationNoticeHref }: Props) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith(examinationNoticeHref)) {
      setVisible(false);
      setReady(true);
      return;
    }
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setVisible(false);
      setReady(true);
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const exams = await apiJson<Examination[]>("/examinations/public-list");
        if (cancelled) return;
        if (exams.length === 0) {
          setVisible(false);
          setReady(true);
          return;
        }
        const examId = exams[0].id;
        const overview =
          staffRole === "depot-keeper"
            ? await getStaffDepotOverview(examId)
            : await getStaffCentreOverview(examId);
        if (cancelled) return;
        const { first, last } = collectExamDates(overview);
        setVisible(shouldShowForWindow(first, last));
      } catch {
        if (!cancelled) setVisible(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [staffRole, pathname, examinationNoticeHref]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!ready || !visible) return null;

  return (
    <div
      className="border-b border-primary/25 bg-primary/10 px-4 py-3 sm:px-6"
      role="region"
      aria-label="Examination notice reminder"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          <span className="font-semibold">Examination notice</span>
          {" — "}
          Official summary and reminders for this examination. Read and familiarise yourself with it before the examination period.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={examinationNoticeHref}
            className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View examination notice
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Dismiss for this session
          </button>
        </div>
      </div>
    </div>
  );
}
