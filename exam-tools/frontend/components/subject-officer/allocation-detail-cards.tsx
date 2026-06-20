"use client";

type AllocationDetailRow = {
  key: string;
  paperNumber: number;
  schoolCode: string;
  schoolName: string;
  envelopeNumber: number;
  seriesNumber: number;
  bookletCount: number;
};

type Props = {
  rows: AllocationDetailRow[];
  bookletTotal: number;
};

export function AllocationDetailCards({ rows, bookletTotal }: Props) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row) => {
          const schoolLabel = `${row.schoolCode} — ${row.schoolName}`;
          return (
            <li
              key={row.key}
              className="rounded-lg border border-border/60 bg-card p-3 shadow-sm"
            >
              <p className="text-xs font-medium text-muted-foreground">Paper {row.paperNumber}</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug" title={schoolLabel}>
                <span className="font-semibold">{row.schoolCode}</span>
                <span className="font-normal text-muted-foreground"> — {row.schoolName}</span>
              </p>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                Env {row.envelopeNumber} · Series {row.seriesNumber} ·{" "}
                {row.bookletCount.toLocaleString()} booklet{row.bookletCount === 1 ? "" : "s"}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border pt-3 text-sm font-semibold text-foreground">
        Total booklets:{" "}
        <span className="tabular-nums">{bookletTotal.toLocaleString()}</span>
      </p>
    </div>
  );
}
