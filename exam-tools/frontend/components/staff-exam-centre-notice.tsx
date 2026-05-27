import {
  centreSubjectScopePhrase,
  externalWriteDestinations,
  shouldShowWhereCandidatesWrite,
  StaffCandidateWriteDestinations,
} from "@/components/staff-candidate-write-destinations";
import type { StaffCentreOverviewResponse } from "@/lib/api";

type Props = {
  overview: StaffCentreOverviewResponse | null;
  className?: string;
};

/**
 * Explains whether the logged-in staff school is the examination centre host or writes at another centre.
 * Inspectors see centre totals for their workspace scope, not “where your candidates write”.
 */
export function StaffExamCentreNotice({ overview, className = "" }: Props) {
  if (!overview) return null;

  const wrap = `rounded-xl border px-3 py-2.5 text-sm ${className}`.trim();

  if (overview.dashboard_viewer === "inspector") {
    const scopePhrase = centreSubjectScopePhrase(overview.centre_subject_scope);
    const scopeDetail =
      overview.centre_subject_scope && overview.centre_subject_scope !== "ALL"
        ? ` for ${scopePhrase}`
        : "";
    return (
      <p className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`} role="status">
        Your workspace is{" "}
        <span className="font-semibold text-foreground">{overview.examination_centre_host_name}</span> (
        <span className="font-mono tabular-nums text-foreground">
          {overview.examination_centre_host_code}
        </span>
        ).{" "}
        <span className="font-medium text-foreground">
          {overview.candidate_count.toLocaleString()} candidates
        </span>{" "}
        at{" "}
        <span className="font-medium text-foreground">
          {overview.school_count.toLocaleString()} schools
        </span>
        {scopeDetail} in this centre scope.
      </p>
    );
  }

  const external = externalWriteDestinations(overview);
  const writesElsewhere = shouldShowWhereCandidatesWrite(overview);

  if (!writesElsewhere) {
    return (
      <p className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`}>
        Your school ({overview.supervisor_school_name}) is the examination centre for this cluster (
        <span className="font-mono tabular-nums text-foreground">{overview.supervisor_school_code}</span>
        ).
      </p>
    );
  }

  if (!overview.supervisor_school_is_centre_host) {
    return (
      <div
        className={`${wrap} border-primary/40 bg-primary/5 text-foreground`}
        role="status"
      >
        <p className="font-medium">Where your candidates write</p>
        <p className="mt-1 text-foreground/90">
          Your school ({overview.supervisor_school_name}, code {overview.supervisor_school_code}) is not an
          examination centre.
        </p>
        <StaffCandidateWriteDestinations className="mt-3" destinations={external} compact />
      </div>
    );
  }

  return (
    <div className={`${wrap} border-border/80 bg-muted/30 text-foreground`} role="status">
      <p className="font-medium text-foreground">
        Your school ({overview.supervisor_school_name}) hosts an examination centre; some candidates also write
        elsewhere
      </p>
      <StaffCandidateWriteDestinations className="mt-2" destinations={external} compact />
    </div>
  );
}
