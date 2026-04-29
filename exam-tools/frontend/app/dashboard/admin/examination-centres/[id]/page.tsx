"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiJson, type ExaminationCenterDetailResponse, type School } from "@/lib/api";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function SchoolDetailCard({ title, school }: { title: string; school: School }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Code</dt>
          <dd className="mt-0.5 font-mono text-xs font-medium text-foreground">{school.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Name</dt>
          <dd className="mt-0.5 text-foreground">{school.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Region</dt>
          <dd className="mt-0.5 text-foreground">{school.region}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Zone</dt>
          <dd className="mt-0.5 text-foreground">{school.zone}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">School type</dt>
          <dd className="mt-0.5 text-foreground">{school.school_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Private examination center</dt>
          <dd className="mt-0.5 text-foreground">
            {school.is_private_examination_center ? "Yes" : "No"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Writes at centre (host code)</dt>
          <dd className="mt-0.5 font-mono text-xs text-foreground">
            {school.writes_at_center_code ?? "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default function ExaminationCentreDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [data, setData] = useState<ExaminationCenterDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<ExaminationCenterDetailResponse>(
        `/schools/examination-centers/${encodeURIComponent(id)}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load centre");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/admin/examination-centres"
          className={`inline-flex min-h-11 items-center rounded-lg border border-input-border px-4 text-sm font-medium text-foreground hover:bg-muted ${inputFocusRing}`}
        >
          Back to list
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : data ? (
        <>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Examination centre</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Host school and every school that writes at this centre.
            </p>
          </div>

          <SchoolDetailCard title="Centre (host school)" school={data.center} />

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-card-foreground">
              Schools writing at this centre
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.hosted_schools.length === 0
                ? "No schools are assigned to write at this centre."
                : `${data.hosted_schools.length} school${data.hosted_schools.length === 1 ? "" : "s"}.`}
            </p>

            {data.hosted_schools.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Region</th>
                      <th className="px-3 py-2 font-medium">Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.hosted_schools.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                        <td className="max-w-[200px] truncate px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.region}</td>
                        <td className="px-3 py-2">{s.zone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-card-foreground">
              Inspectors at this centre
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspectors linked to the host school or any school that writes at this centre (
              {data.inspectors.length} total).
            </p>
            {data.inspectors.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Assigned school</th>
                      <th className="px-3 py-2 font-medium">Full name</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">School code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inspectors.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="max-w-[200px] px-3 py-2">{row.school_name}</td>
                        <td className="px-3 py-2">{row.full_name}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.phone_number ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.school_code ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No inspectors are linked to schools in this centre.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
