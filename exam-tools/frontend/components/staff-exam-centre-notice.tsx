import type { StaffCentreOverviewResponse } from "@/lib/api";

type Props = {
  overview: StaffCentreOverviewResponse | null;
  className?: string;
};

/**
 * Explains whether the logged-in staff school is the examination centre host or writes at another centre.
 */
export function StaffExamCentreNotice({ overview, className = "" }: Props) {
  if (!overview) return null;

  const wrap = `rounded-xl border px-3 py-2.5 text-sm ${className}`.trim();

  if (!overview.supervisor_school_is_centre_host) {
    return (
      <div
        className={`${wrap} border-primary/40 bg-primary/5 text-foreground`}
        role="status"
      >
        <p className="font-medium">Where your candidates write</p>
        <p className="mt-1 text-foreground/90">
          Your school ({overview.supervisor_school_name}, code {overview.supervisor_school_code}) is not an
          examination centre. Registered candidates write at{" "}
          <span className="font-semibold">{overview.examination_centre_host_name}</span> (examination centre code{" "}
          <span className="font-mono tabular-nums">{overview.examination_centre_host_code}</span>).
        </p>
      </div>
    );
  }

  return (
    <p className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`}>
      Your school ({overview.supervisor_school_name}) is the examination centre for this cluster (
      <span className="font-mono tabular-nums text-foreground">{overview.examination_centre_host_code}</span>).
    </p>
  );
}
