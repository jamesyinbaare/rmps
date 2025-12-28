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
  gradeDistribution?: any;
  impactMetrics?: any;
}

interface ScoreDistributionChartProps {
  scores: number[];
  boundarySets: BoundarySet[];
  scoreStats?: Record<string, number | null> | null;
}

const GRADE_COLORS: Record<string, string> = {
  Distinction: "#FFD700", // Gold
  "Upper Credit": "#C0C0C0", // Silver
  Credit: "#CD7F32", // Bronze
  "Lower Credit": "#87CEEB", // Sky Blue
  Pass: "#90EE90", // Light Green
  Fail: "#FFB6C1", // Light Pink
};

const LINE_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

export function ScoreDistributionChart({
  scores,
  boundarySets,
  scoreStats,
}: ScoreDistributionChartProps) {
  const chartData = useMemo(() => {
    if (scores.length === 0) return [];

    const minScore = 0;
    const maxScore = 100;
    const binCount = 40;
    const binSize = (maxScore - minScore) / binCount;

    const bins: Array<{
      range: string;
      min: number;
      max: number;
      count: number;
      mid: number;
      score: number; // Use mid for x-axis positioning
    }> = [];

    for (let i = 0; i < binCount; i++) {
      const binMin = minScore + i * binSize;
      const binMax = binMin + binSize;
      const count = scores.filter((s) => s >= binMin && s < binMax).length;
      const mid = (binMin + binMax) / 2;
      bins.push({
        range: `${Math.round(binMin)}-${Math.round(binMax)}`,
        min: binMin,
        max: binMax,
        count,
        mid,
        score: mid, // Use mid for x-axis
      });
    }

    return bins;
  }, [scores]);

  const referenceLines = useMemo(() => {
    const lines: Array<{ value: number; label: string; color: string; method: string }> = [];
    boundarySets.forEach((set, setIndex) => {
      const color = LINE_COLORS[setIndex % LINE_COLORS.length];
      Object.entries(set.boundaries).forEach(([grade, cutoff]) => {
        if (grade !== "Fail" && cutoff > 0) {
          lines.push({
            value: cutoff,
            label: `${set.name.substring(0, 10)} - ${grade.substring(0, 3)}`,
            color,
            method: set.name,
          });
        }
      });
    });
    return lines;
  }, [boundarySets]);

  if (scores.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No score data available
      </div>
    );
  }

  const chartConfig = {
    count: {
      label: "Frequency",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  // Group reference lines by method for legend
  const methodGroups = Array.from(new Set(referenceLines.map((l) => l.method)));

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="score"
          type="number"
          scale="linear"
          domain={[0, 100]}
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          label={{ value: "Score", position: "insideBottom", offset: -5 }}
          tickFormatter={(value) => Math.round(value).toString()}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Frequency", angle: -90, position: "insideLeft" }}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, props) => {
                const payload = props.payload as typeof chartData[0];
                return [
                  <div key="main" className="space-y-1">
                    <div className="font-medium">Range: {payload.range}</div>
                    <div className="text-sm font-semibold">Count: {payload.count}</div>
                  </div>,
                  null,
                ];
              }}
              labelFormatter={(label) => `Score: ${Math.round(Number(label))}`}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
        {referenceLines.map((line, idx) => (
          <ReferenceLine
            key={`${line.method}-${line.value}-${idx}`}
            x={line.value}
            stroke={line.color}
            strokeDasharray={idx % 2 === 0 ? "5 5" : "3 3"}
            strokeOpacity={0.7}
            label={{
              value: `${line.label}`,
              position: "top",
              fontSize: 10,
              fill: line.color,
            }}
          />
        ))}
        <Legend
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-4 justify-center mt-4 text-sm">
                {methodGroups.map((method, idx) => (
                  <div key={method} className="flex items-center gap-2">
                    <div
                      className="w-4 h-0.5"
                      style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                    />
                    <span className="text-xs">{method}</span>
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
