"use client";

import { useMemo } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine, ReferenceArea } from "recharts";
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

interface CumulativeDistributionChartProps {
  scores: number[];
  boundarySets: BoundarySet[];
}

const KEY_PERCENTILES = [95, 80, 50, 20, 5];

export function CumulativeDistributionChart({
  scores,
  boundarySets,
}: CumulativeDistributionChartProps) {
  const chartData = useMemo(() => {
    if (scores.length === 0) return [];

    const sortedScores = [...scores].sort((a, b) => a - b);
    return sortedScores.map((score, index) => ({
      score: Math.round(score * 10) / 10,
      cumulative: ((index + 1) / sortedScores.length) * 100,
    }));
  }, [scores]);

  const percentileData = useMemo(() => {
    if (scores.length === 0) return [];

    const sortedScores = [...scores].sort((a, b) => a - b);
    return KEY_PERCENTILES.map((p) => {
      const index = Math.floor((p / 100) * (sortedScores.length - 1));
      return {
        percentile: p,
        score: sortedScores[index] || 0,
      };
    });
  }, [scores]);

  if (scores.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No score data available
      </div>
    );
  }

  const chartConfig = {
    cumulative: {
      label: "Cumulative %",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="score"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          label={{ value: "Score", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Cumulative %", angle: -90, position: "insideLeft" }}
          domain={[0, 100]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`${Number(value).toFixed(1)}%`, "Cumulative"]}
              labelFormatter={(label) => `Score: ${label}`}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="cumulative"
          stroke="var(--color-cumulative)"
          strokeWidth={2}
          dot={false}
        />
        {percentileData.map((p) => (
          <g key={`percentile-${p.percentile}`}>
            <ReferenceLine
              x={p.score}
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: `P${p.percentile}=${Math.round(p.score)}`,
                position: "top",
                fontSize: 10,
                fill: "#ef4444",
              }}
            />
            <ReferenceLine
              y={p.percentile}
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          </g>
        ))}
      </LineChart>
    </ChartContainer>
  );
}
