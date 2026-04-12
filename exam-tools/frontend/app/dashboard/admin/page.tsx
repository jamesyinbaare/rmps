"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  apiJson,
  type AdminDepotKeeperListResponse,
  type AdminDepotListResponse,
  type ExaminationCenterListResponse,
  type InspectorListResponse,
  type SchoolListResponse,
} from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";

const cardClass =
  "block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-muted/30";
const linkClass =
  "mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover";

type SummaryState = {
  schools: number | null;
  centres: number | null;
  inspectors: number | null;
  depots: number | null;
  depotKeepers: number | null;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);
  const [summary, setSummary] = useState<SummaryState>({
    schools: null,
    centres: null,
    inspectors: null,
    depots: null,
    depotKeepers: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setMe(user);
        if (user.role === "TEST_ADMIN_OFFICER") {
          router.replace("/dashboard/admin/monitoring");
          return;
        }
      } catch {
        if (cancelled) return;
        setMe(null);
      }

      setError(null);
      try {
        const [schoolsRes, centresRes, inspectorsRes, depotsRes, keepersRes] = await Promise.all([
          apiJson<SchoolListResponse>("/schools?skip=0&limit=1"),
          apiJson<ExaminationCenterListResponse>("/schools/examination-centers?skip=0&limit=1"),
          apiJson<InspectorListResponse>("/inspectors?skip=0&limit=1&sort=full_name&order=asc"),
          apiJson<AdminDepotListResponse>("/depots?skip=0&limit=1"),
          apiJson<AdminDepotKeeperListResponse>("/depots/keepers?skip=0&limit=1"),
        ]);
        if (cancelled) return;
        setSummary({
          schools: schoolsRes.total,
          centres: centresRes.total,
          inspectors: inspectorsRes.total,
          depots: depotsRes.total,
          depotKeepers: keepersRes.total,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load summary");
        setSummary({
          schools: null,
          centres: null,
          inspectors: null,
          depots: null,
          depotKeepers: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function formatCount(n: number | null): string {
    if (n === null) return "—";
    return n.toLocaleString();
  }

  if (me?.role === "TEST_ADMIN_OFFICER") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Totals across schools, centres, inspectors, and depots.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <Link href="/dashboard/admin/users" className={cardClass}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Users
            </h3>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
              {formatCount(summary.inspectors)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspectors shown; create inspectors, depot keepers, and test admin officers.
            </p>
            <span className={linkClass}>Manage users</span>
          </Link>
        </li>
        <li>
          <Link href="/dashboard/admin/depots" className={cardClass}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Depots & keepers
            </h3>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
              {formatCount(summary.depots)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.depotKeepers === null
                ? "— depot keepers"
                : `${summary.depotKeepers.toLocaleString()} depot keeper${summary.depotKeepers === 1 ? "" : "s"}`}
            </p>
            <span className={linkClass}>Manage depots & keepers</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
