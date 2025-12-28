"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BoundarySet {
  name: string;
  boundaries: Record<string, number>;
  gradeDistribution: {
    pass_rate: number | null;
    distinction_rate: number | null;
  };
  impactMetrics: {
    average_grade_gap: number | null;
  };
}

interface QualityMetricsTableProps {
  boundarySets: BoundarySet[];
}

export function QualityMetricsTable({ boundarySets }: QualityMetricsTableProps) {
  if (boundarySets.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Pass Rate</TableHead>
            <TableHead className="text-right">Distinction %</TableHead>
            <TableHead className="text-right">Avg Gap</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {boundarySets.map((set) => (
            <TableRow key={set.name}>
              <TableCell className="font-medium">{set.name}</TableCell>
              <TableCell className="text-right">
                {set.gradeDistribution.pass_rate !== null
                  ? `${set.gradeDistribution.pass_rate.toFixed(1)}%`
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                {set.gradeDistribution.distinction_rate !== null
                  ? `${set.gradeDistribution.distinction_rate.toFixed(1)}%`
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                {set.impactMetrics.average_grade_gap !== null
                  ? `${set.impactMetrics.average_grade_gap.toFixed(1)}`
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
