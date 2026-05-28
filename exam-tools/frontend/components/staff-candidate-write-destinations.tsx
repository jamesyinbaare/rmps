import { SubjectScopeBadge } from "@/components/subject-scope-badge";
import type { StaffCandidateWriteDestination, StaffCentreOverviewResponse } from "@/lib/api";
import { subjectScopeLabel } from "@/lib/subject-scope-display";

export function membershipScopeLabel(scope: string): string {
  const label = subjectScopeLabel(scope);
  if (label === "Core") return "Core subjects";
  if (label === "Elective") return "Elective subjects";
  if (label === "All subjects") return "All subjects";
  return label;
}

function normalizeSchoolCode(code: string): string {
  return code.trim().toUpperCase();
}

/** CORE + ELECTIVE at the same centre → one ALL row. */
export function consolidateWriteDestinationsByCentre(
  destinations: StaffCandidateWriteDestination[],
): StaffCandidateWriteDestination[] {
  if (destinations.length <= 1) return destinations;

  const byCentre = new Map<string, StaffCandidateWriteDestination[]>();
  for (const d of destinations) {
    const key = d.centre_id;
    const group = byCentre.get(key) ?? [];
    group.push(d);
    byCentre.set(key, group);
  }

  const consolidated: StaffCandidateWriteDestination[] = [];
  const groups = [...byCentre.values()].sort((a, b) =>
    a[0].centre_code.localeCompare(b[0].centre_code),
  );

  for (const group of groups) {
    const scopes = new Set(group.map((d) => d.subject_scope.toUpperCase()));
    const first = group[0];
    if (scopes.has("ALL") || (scopes.has("CORE") && scopes.has("ELECTIVE"))) {
      consolidated.push({
        ...first,
        subject_scope: "ALL",
      });
    } else {
      consolidated.push(...group);
    }
  }

  const scopeOrder = { ALL: 0, CORE: 1, ELECTIVE: 2 };
  return consolidated.sort(
    (a, b) =>
      (scopeOrder[a.subject_scope.toUpperCase() as keyof typeof scopeOrder] ?? 99) -
      (scopeOrder[b.subject_scope.toUpperCase() as keyof typeof scopeOrder] ?? 99),
  );
}

/** All write destinations from overview (API list or legacy single host fields). */
export function resolveWriteDestinations(
  overview: StaffCentreOverviewResponse,
): StaffCandidateWriteDestination[] {
  const raw =
    overview.candidate_write_destinations?.length
      ? overview.candidate_write_destinations
      : [
          {
            subject_scope: "ALL",
            centre_id: overview.examination_centre_host_school_id,
            centre_code: overview.examination_centre_host_code,
            centre_name: overview.examination_centre_host_name,
            centre_region: overview.examination_centre_region,
          },
        ];
  return consolidateWriteDestinationsByCentre(raw);
}

/** Destinations at another school's centre — omit when candidates write at this school. */
export function externalWriteDestinations(
  overview: StaffCentreOverviewResponse,
): StaffCandidateWriteDestination[] {
  const ownCode = normalizeSchoolCode(overview.supervisor_school_code);
  return resolveWriteDestinations(overview).filter(
    (d) => normalizeSchoolCode(d.centre_code) !== ownCode,
  );
}

export function shouldShowWhereCandidatesWrite(overview: StaffCentreOverviewResponse): boolean {
  if (overview.dashboard_viewer === "inspector") return false;
  return externalWriteDestinations(overview).length > 0;
}

/** Wording for inspector workspace scope (core / elective / all subjects). */
export function centreSubjectScopePhrase(scope: string | null | undefined): string {
  switch (scope?.toUpperCase()) {
    case "CORE":
      return "core subjects";
    case "ELECTIVE":
      return "elective subjects";
    case "ALL":
      return "all subjects";
    default:
      return "this scope";
  }
}

type StaffCandidateWriteDestinationsProps = {
  destinations: StaffCandidateWriteDestination[];
  /** When true, copy refers to the school as centre host. */
  isCentreHost?: boolean;
  className?: string;
  compact?: boolean;
};

export function StaffCandidateWriteDestinations({
  destinations,
  isCentreHost = false,
  className = "",
  compact = false,
}: StaffCandidateWriteDestinationsProps) {
  if (destinations.length === 0) return null;

  if (destinations.length === 1) {
    const d = destinations[0];
    const scopeNote =
      destinations[0].subject_scope.toUpperCase() !== "ALL"
        ? ` (${membershipScopeLabel(d.subject_scope)})`
        : "";
    return (
      <div className={className}>
        <p className={compact ? "text-sm text-foreground/90" : "mt-2 line-clamp-3 text-xl font-bold leading-snug text-foreground"}>
          {d.centre_name}
        </p>
        <p className={compact ? "mt-1 text-sm text-muted-foreground" : "mt-2 text-sm text-foreground/85"}>
          Examination centre code{" "}
          <span className="font-mono font-semibold tabular-nums text-primary">{d.centre_code}</span>
          {scopeNote}
          {isCentreHost
            ? " — your school hosts this centre."
            : " — your candidates write their examinations here."}
        </p>
      </div>
    );
  }

  return (
    <ul className={`space-y-3 ${className}`.trim()}>
      {destinations.map((d) => (
        <li
          key={`${d.subject_scope}-${d.centre_id}`}
          className="rounded-lg border border-primary/25 bg-background/60 px-3 py-2.5"
        >
          <SubjectScopeBadge scope={d.subject_scope} className="uppercase" />
          <p className="mt-1 font-semibold leading-snug text-foreground">{d.centre_name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Centre code{" "}
            <span className="font-mono font-medium tabular-nums text-foreground">{d.centre_code}</span>
            {d.centre_region && d.centre_region !== "—" ? ` · ${d.centre_region}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
