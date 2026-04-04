"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  apiJson,
  type ExaminationCenterListResponse,
  type InspectorListResponse,
  type SchoolListResponse,
} from "@/lib/api";

const cardClass =
  "block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-muted/30";
const linkClass =
  "mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover";

type SummaryState = {
  schools: number | null;
  centres: number | null;
  inspectors: number | null;
};

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryState>({
    schools: null,
    centres: null,
    inspectors: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);
      try {
        const [schoolsRes, centresRes, inspectorsRes] = await Promise.all([
          apiJson<SchoolListResponse>("/schools?skip=0&limit=1"),
          apiJson<ExaminationCenterListResponse>("/schools/examination-centers?skip=0&limit=1"),
          apiJson<InspectorListResponse>("/inspectors?skip=0&limit=1&sort=full_name&order=asc"),
        ]);
        if (cancelled) return;
        setSummary({
          schools: schoolsRes.total,
          centres: centresRes.total,
          inspectors: inspectorsRes.total,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load summary");
        setSummary({ schools: null, centres: null, inspectors: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function formatCount(n: number | null): string {
    if (n === null) return "—";
    return n.toLocaleString();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Totals across schools, examination centres, and inspectors.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <li>
          <Link href="/dashboard/admin/schools" className={cardClass}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Schools
            </h3>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
              {formatCount(summary.schools)}
            </p>
            <span className={linkClass}>Manage schools</span>
          </Link>
        </li>
        <li>
          <Link href="/dashboard/admin/examination-centres" className={cardClass}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Examination centres
            </h3>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
              {formatCount(summary.centres)}
            </p>
            <span className={linkClass}>View centres</span>
          </Link>
        </li>
        <li>
          <Link href="/dashboard/admin/inspectors" className={cardClass}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Inspectors
            </h3>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
              {formatCount(summary.inspectors)}
            </p>
            <span className={linkClass}>Manage inspectors</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
