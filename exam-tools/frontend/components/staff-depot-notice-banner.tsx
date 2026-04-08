import type { StaffDepotOverviewResponse } from "@/lib/api";

type Props = {
  overview: StaffDepotOverviewResponse | null;
  className?: string;
};

export function StaffDepotNoticeBanner({ overview, className = "" }: Props) {
  if (!overview) return null;

  const wrap = `rounded-xl border px-3 py-2.5 text-sm ${className}`.trim();

  return (
    <div className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`} role="status">
      <p className="font-medium text-foreground">Depot scope</p>
      <p className="mt-1 text-foreground/90">
        This notice aggregates registered candidates and programmes across{" "}
        <span className="font-semibold">{overview.school_count.toLocaleString()}</span> school
        {overview.school_count === 1 ? "" : "s"} in depot{" "}
        <span className="font-semibold">{overview.depot_name}</span> (code{" "}
        <span className="font-mono tabular-nums">{overview.depot_code}</span>). Schools may write at different
        examination centres.
      </p>
    </div>
  );
}
