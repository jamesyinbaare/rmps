"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend, Tooltip } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface BoundarySet {
  name: string;
  boundaries: Record<string, number>;
  gradeDistribution: {
    grade_counts: Record<string, number>;
    grade_percentages: Record<string, number>;
  };
}

interface GradeDistributionComparisonChartProps {
  boundarySets: BoundarySet[];
}

const GRADE_ORDER = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass", "Fail"];

const GRADE_COLORS: Record<string, string> = {
  Distinction: "#FFD700",
  "Upper Credit": "#C0C0C0",
  Credit: "#CD7F32",
  "Lower Credit": "#87CEEB",
  Pass: "#90EE90",
  Fail: "#FFB6C1",
};

export function GradeDistributionComparisonChart({
  boundarySets,
}: GradeDistributionComparisonChartProps) {
  const chartData = useMemo(() => {
    if (boundarySets.length === 0) return [];

    return boundarySets.map((set) => {
      const data: Record<string, any> = {
        method: set.name.length > 20 ? set.name.substring(0, 20) + "..." : set.name,
      };

      GRADE_ORDER.forEach((grade) => {
        data[grade] = set.gradeDistribution.grade_counts[grade] || 0;
      });

      return data;
    });
  }, [boundarySets]);

  if (boundarySets.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  const chartConfig = GRADE_ORDER.reduce((acc, grade) => {
    acc[grade] = {
      label: grade,
      color: GRADE_COLORS[grade] || "hsl(var(--chart-1))",
    };
    return acc;
  }, {} as ChartConfig);

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} label={{ value: "Number of Students", position: "insideBottom", offset: -5 }} />
        <YAxis
          dataKey="method"
          type="category"
          tickLine={false}
          axisLine={false}
          width={150}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                `${value} students (${((Number(value) / (boundarySets[0]?.gradeDistribution.grade_counts ? Object.values(boundarySets[0].gradeDistribution.grade_counts).reduce((a, b) => a + b, 0) : 0)) * 100).toFixed(1)}%)`,
                name,
              ]}
            />
          }
        />
        {GRADE_ORDER.map((grade) => (
          <Bar
            key={grade}
            dataKey={grade}
            stackId="grades"
            fill={GRADE_COLORS[grade] || "hsl(var(--chart-1))"}
            radius={[0, 4, 4, 0]}
          />
        ))}
        <Legend
          wrapperStyle={{ paddingTop: "20px" }}
          content={({ payload }) => {
            if (!payload) return null;
            return (
              <div className="flex flex-wrap gap-4 justify-center mt-4">
                {payload.map((entry) => (
                  <div key={entry.value} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>{entry.value}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
      </BarChart>
    </ChartContainer>
  );
}
