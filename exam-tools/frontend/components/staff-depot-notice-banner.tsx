import type { StaffDepotOverviewResponse } from "@/lib/api";

type Props = {
  overview: StaffDepotOverviewResponse | null;
  className?: string;
};

/** Short scope note for the depot notice — avoids repeating depot name/code already stated in the appointment letter. */
export function StaffDepotNoticeBanner({ overview, className = "" }: Props) {
  if (!overview) return null;

  const wrap = `rounded-xl border px-3 py-2.5 text-sm ${className}`.trim();
  const examLabel = `${overview.exam_type}${overview.exam_series ? ` ${overview.exam_series}` : ""} ${overview.year}`;

  return (
    <div className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`} role="note">
      <p className="text-foreground/90">
        Figures and summaries on this page aggregate registered candidates and timetable data for{" "}
        <span className="font-medium text-foreground">{examLabel}</span> across every school linked to your depot.
        Schools may sit papers at different registered examination centres.
      </p>
    </div>
  );
}
