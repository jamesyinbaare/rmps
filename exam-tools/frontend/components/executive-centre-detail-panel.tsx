"use client";

import { Building2, GraduationCap } from "lucide-react";

import { ExecutiveSectionHeading, ExecutiveStatTile } from "@/components/executive-ui";
import { PostedInspectorsList } from "@/components/posted-inspectors-list";
import type { ExecutiveCentreDetailResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const summaryToggleClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

function truncateEnd(text: string, max = 36): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type Props = {
  detail: ExecutiveCentreDetailResponse;
  onClose: () => void;
};

export function ExecutiveCentreDetailPanel({ detail, onClose }: Props) {
  const { overview, posted_inspectors: inspectors } = detail;
  const region =
    overview.examination_centre_region !== "—" ? overview.examination_centre_region : null;

  return (
    <section aria-labelledby="executive-centre-detail-heading">
      <div className="-mx-4 -mt-3 mb-5 overflow-hidden">
        <div className="relative bg-linear-to-br from-primary via-accent to-success px-4 pb-5 pt-4">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.14),transparent_60%)]"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/80">
                Examination centre
              </p>
              <h3
                id="executive-centre-detail-heading"
                className="mt-1 text-lg font-bold leading-snug text-primary-foreground sm:text-xl"
              >
                {overview.examination_centre_host_name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground/15 px-2 py-1 font-mono text-xs font-semibold text-primary-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  {overview.examination_centre_host_code}
                </span>
                {region ? (
                  <span className="rounded-full bg-secondary/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-secondary-foreground">
                    {region}
                  </span>
                ) : null}
              </div>
            </div>
            <button type="button" onClick={onClose} className={summaryToggleClass}>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:hidden">
        <ExecutiveStatTile label="Candidates" value={overview.candidate_count} tint="primary" />
        <ExecutiveStatTile label="Schools" value={overview.school_count} tint="success" />
      </div>
      <ul className="mt-0 hidden grid-cols-1 gap-3 md:grid md:grid-cols-2 md:gap-4">
        <li>
          <ExecutiveStatTile label="Candidates at centre" value={overview.candidate_count} tint="primary" />
        </li>
        <li>
          <ExecutiveStatTile label="Schools" value={overview.school_count} tint="success" />
        </li>
      </ul>

      <PostedInspectorsList
        className="mt-6 md:mt-8"
        inspectors={inspectors}
        emptyMessage="No inspectors at this centre."
      />

      <div className="mt-6 md:mt-8">
        <ExecutiveSectionHeading icon={GraduationCap} accentClass="bg-success" as="h4">
          Schools
        </ExecutiveSectionHeading>
        {overview.schools_with_candidate_counts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            No schools with candidates.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-success/15 overflow-hidden rounded-xl border border-success/20 bg-linear-to-b from-success/5 to-card shadow-sm md:hidden">
              {overview.schools_with_candidate_counts.map((s, i) => (
                <li
                  key={s.school_id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-4 py-3",
                    i % 2 === 1 && "bg-success/4",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{s.school_code}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground" title={s.school_name}>
                      {truncateEnd(s.school_name, 48)}
                    </p>
                  </div>
                  <p className="shrink-0 rounded-md bg-success/10 px-2 py-0.5 tabular-nums text-sm font-bold text-success">
                    {s.candidate_count.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 hidden overflow-hidden rounded-xl border border-success/20 shadow-sm md:block">
              <table className="w-full min-w-[min(100%,18rem)] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-success/15 bg-linear-to-r from-success/10 via-accent/5 to-transparent text-left">
                    <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                      School
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-card-foreground">
                      Candidates
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.schools_with_candidate_counts.map((s, i) => (
                    <tr
                      key={s.school_id}
                      className={cn(
                        "border-b border-border/70 last:border-b-0",
                        i % 2 === 1 && "bg-success/4",
                      )}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <span className="font-semibold text-foreground">{s.school_code}</span>
                        <span
                          className="mt-0.5 block text-xs text-muted-foreground"
                          title={s.school_name}
                        >
                          {truncateEnd(s.school_name, 40)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        <span className="inline-block rounded-md bg-success/10 px-2 py-0.5 tabular-nums font-bold text-success">
                          {s.candidate_count.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
