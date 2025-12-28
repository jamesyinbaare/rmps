"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface BoundarySet {
  name: string;
  boundaries: Record<string, number>;
}

interface GapAnalysisChartProps {
  boundarySets: BoundarySet[];
}

const GRADE_PAIRS = [
  { higher: "Distinction", lower: "Upper Credit", label: "D→UC" },
  { higher: "Upper Credit", lower: "Credit", label: "UC→C" },
  { higher: "Credit", lower: "Lower Credit", label: "C→LC" },
  { higher: "Lower Credit", lower: "Pass", label: "LC→P" },
];

export function GapAnalysisChart({ boundarySets }: GapAnalysisChartProps) {
  const chartData = useMemo(() => {
    if (boundarySets.length === 0) return [];

    const data: Array<Record<string, any>> = [];

    GRADE_PAIRS.forEach((pair) => {
      const entry: Record<string, any> = {
        transition: pair.label,
      };

      boundarySets.forEach((set) => {
        const higherBoundary = set.boundaries[pair.higher] || 0;
        const lowerBoundary = set.boundaries[pair.lower] || 0;
        const gap = higherBoundary - lowerBoundary;
        entry[set.name] = Math.round(gap * 10) / 10;
      });

      data.push(entry);
    });

    return data;
  }, [boundarySets]);

  if (boundarySets.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  const chartConfig = boundarySets.reduce((acc, set) => {
    acc[set.name] = {
      label: set.name,
      color: `hsl(var(--chart-${(boundarySets.indexOf(set) % 5) + 1}))`,
    };
    return acc;
  }, {} as ChartConfig);

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="transition"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Grade Transition", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Marks Gap", angle: -90, position: "insideLeft" }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`${value} marks`, "Gap"]}
              labelFormatter={(label) => `Transition: ${label}`}
            />
          }
        />
        <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: "Min Gap (5)", position: "right" }} />
        <ReferenceLine y={15} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Max Gap (15)", position: "right" }} />
        {boundarySets.map((set, idx) => (
          <Bar
            key={set.name}
            dataKey={set.name}
            fill={`var(--color-${set.name.replace(/\s+/g, "-").toLowerCase()})`}
            radius={[4, 4, 0, 0]}
          />
        ))}
        <Legend
          content={({ payload }) => {
            if (!payload) return null;
            return (
              <div className="flex flex-wrap gap-4 justify-center mt-4 text-sm">
                {payload.map((entry) => (
                  <div key={entry.value} className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-xs">{entry.value}</span>
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
