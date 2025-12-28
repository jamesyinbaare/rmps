"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface BoundarySet {
  name: string;
  boundaries: Record<string, number>;
  impactMetrics?: {
    borderline_candidates: Array<{
      grade: string;
      cutoff: number;
      borderline_count: number;
      borderline_percentage: number;
    }>;
  };
}

interface BorderlineCandidatesChartProps {
  boundarySets: BoundarySet[];
  totalStudents: number;
}

const GRADE_ORDER = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass"];

export function BorderlineCandidatesChart({
  boundarySets,
  totalStudents,
}: BorderlineCandidatesChartProps) {
  // Use the first boundary set for borderline analysis
  const firstSet = boundarySets[0];

  const chartData = useMemo(() => {
    if (!firstSet || !firstSet.impactMetrics) return [];

    return firstSet.impactMetrics.borderline_candidates.map((candidate) => ({
      grade: candidate.grade.length > 3 ? candidate.grade.substring(0, 3) : candidate.grade,
      count: candidate.borderline_count,
      percentage: candidate.borderline_percentage,
      fullGrade: candidate.grade,
    }));
  }, [firstSet]);

  if (!firstSet || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No borderline data available
      </div>
    );
  }

  const chartConfig = {
    count: {
      label: "Number of Students",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="grade"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Grade Boundary", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Number of Students", angle: -90, position: "insideLeft" }}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, props) => {
                const payload = props.payload as typeof chartData[0];
                return [
                  <div key="main" className="space-y-1">
                    <div className="font-medium">{payload.fullGrade} Boundary</div>
                    <div className="text-sm font-semibold">Count: {payload.count}</div>
                    <div className="text-xs text-muted-foreground">
                      {payload.percentage.toFixed(1)}% of total
                    </div>
                  </div>,
                  null,
                ];
              }}
            />
          }
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill="#f97316" fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
