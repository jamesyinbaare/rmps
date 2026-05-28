"use client";

import { useMemo } from "react";
import { Building2, GraduationCap, Phone, Users } from "lucide-react";

import {
  ExecutiveSectionHeading,
  ExecutiveStatTile,
  executiveScopeBadgeClass,
  executiveScopeLabel,
} from "@/components/executive-ui";
import type { ExecutiveCentreDetailResponse, ExecutivePostedInspectorItem } from "@/lib/api";
import { cn } from "@/lib/utils";

const summaryToggleClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

const inspectorScopeOrder: Record<string, number> = {
  ALL: 0,
  CORE: 1,
  ELECTIVE: 2,
};

function normalizeScope(scope: string): "ALL" | "CORE" | "ELECTIVE" {
  const normalized = scope.toUpperCase();
  if (normalized === "CORE" || normalized === "ELECTIVE" || normalized === "ALL") return normalized;
  return "ALL";
}

function inspectorMergeKey(insp: ExecutivePostedInspectorItem): string {
  const normalizedName = insp.inspector_full_name.trim().toLowerCase();
  const normalizedPhone = (insp.inspector_phone_number ?? "").replace(/\D/g, "");
  if (normalizedName || normalizedPhone) return `np:${normalizedName}|${normalizedPhone}`;
  return `id:${insp.posting_id}`;
}

function truncateEnd(text: string, max = 36): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function InspectorMobileCard({ insp }: { insp: ExecutivePostedInspectorItem }) {
  return (
    <li className="overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-card shadow-sm">
      <div className="border-l-4 border-primary px-4 py-3.5">
        <p className="font-semibold text-foreground">{insp.inspector_full_name}</p>
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            executiveScopeBadgeClass(insp.subject_scope),
          )}
        >
          {executiveScopeLabel(insp.subject_scope)}
        </span>
        {insp.inspector_phone_number ? (
          <a
            href={`tel:${insp.inspector_phone_number}`}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Call {insp.inspector_phone_number}
          </a>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No phone number on file</p>
        )}
      </div>
    </li>
  );
}

type Props = {
  detail: ExecutiveCentreDetailResponse;
  onClose: () => void;
};

export function ExecutiveCentreDetailPanel({ detail, onClose }: Props) {
  const { overview, posted_inspectors } = detail;
  const region =
    overview.examination_centre_region !== "—" ? overview.examination_centre_region : null;
  const mergedInspectors = useMemo(() => {
    const grouped = new Map<string, ExecutivePostedInspectorItem>();
    for (const insp of posted_inspectors) {
      const key = inspectorMergeKey(insp);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...insp, subject_scope: normalizeScope(insp.subject_scope) });
        continue;
      }
      const existingScope = normalizeScope(existing.subject_scope);
      const nextScope = normalizeScope(insp.subject_scope);
      const mergedScope =
        existingScope === "ALL" ||
        nextScope === "ALL" ||
        (existingScope === "CORE" && nextScope === "ELECTIVE") ||
        (existingScope === "ELECTIVE" && nextScope === "CORE")
          ? "ALL"
          : existingScope;

      grouped.set(key, {
        ...existing,
        posting_id: existing.posting_id.localeCompare(insp.posting_id) <= 0 ? existing.posting_id : insp.posting_id,
        inspector_phone_number: existing.inspector_phone_number ?? insp.inspector_phone_number,
        subject_scope: mergedScope,
      });
    }

    return [...grouped.values()].sort((a, b) => {
      const scopeCmp =
        (inspectorScopeOrder[normalizeScope(a.subject_scope)] ?? 99) -
        (inspectorScopeOrder[normalizeScope(b.subject_scope)] ?? 99);
      if (scopeCmp !== 0) return scopeCmp;
      const nameCmp = a.inspector_full_name.localeCompare(b.inspector_full_name);
      if (nameCmp !== 0) return nameCmp;
      return a.posting_id.localeCompare(b.posting_id);
    });
  }, [posted_inspectors]);

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

      <div className="mt-6 md:mt-8">
        <ExecutiveSectionHeading icon={Users} accentClass="bg-primary" as="h4">
          Inspectors
        </ExecutiveSectionHeading>
        {mergedInspectors.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            No inspectors at this centre.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3 md:hidden">
              {mergedInspectors.map((insp) => (
                <InspectorMobileCard key={insp.posting_id} insp={insp} />
              ))}
            </ul>
            <div className="mt-3 hidden overflow-hidden rounded-xl border border-primary/20 shadow-sm md:block">
              <table className="w-full min-w-[min(100%,18rem)] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-primary/15 bg-linear-to-r from-primary/10 via-accent/5 to-transparent text-left">
                    <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                      Phone
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                      Scope
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mergedInspectors.map((insp) => (
                    <tr
                      key={insp.posting_id}
                      className="border-b border-border/70 last:border-b-0 even:bg-primary/[0.03]"
                    >
                      <td className="px-3 py-2.5 align-top font-medium text-foreground">
                        {insp.inspector_full_name}
                      </td>
                      <td className="px-3 py-2.5 align-top tabular-nums text-foreground">
                        {insp.inspector_phone_number ? (
                          <a
                            href={`tel:${insp.inspector_phone_number}`}
                            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {insp.inspector_phone_number}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                            executiveScopeBadgeClass(insp.subject_scope),
                          )}
                        >
                          {executiveScopeLabel(insp.subject_scope)}
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
                    i % 2 === 1 && "bg-success/[0.04]",
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
                        i % 2 === 1 && "bg-success/[0.04]",
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
