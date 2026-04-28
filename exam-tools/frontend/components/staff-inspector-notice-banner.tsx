import type { StaffCentreOverviewResponse } from "@/lib/api";

type Props = {
  overview: StaffCentreOverviewResponse | null;
  className?: string;
};

/** Short scope note for the inspector notice — avoids repeating the centre block in the notification below. */
export function StaffInspectorNoticeBanner({ overview, className = "" }: Props) {
  if (!overview) return null;

  const wrap = `rounded-xl border px-3 py-2.5 text-sm ${className}`.trim();
  const examLabel = `${overview.exam_type}${overview.exam_series ? ` ${overview.exam_series}` : ""} ${overview.year}`;

  return (
    <div className={`${wrap} border-border/80 bg-muted/30 text-muted-foreground`} role="note">
      <p className="text-foreground/90">
        This page is for your inspection assignment for{" "}
        <span className="font-medium text-foreground">{examLabel}</span>. The summary panel shows registered candidates, schools, and programmes for that
        centre’s scope.
      </p>
    </div>
  );
}
