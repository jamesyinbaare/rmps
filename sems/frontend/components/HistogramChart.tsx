"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { HistogramData, GradeRangeConfig } from "@/lib/api";

interface HistogramChartProps {
  data: HistogramData;
  gradeRanges?: GradeRangeConfig[] | null;
  onBinClick?: (bin: HistogramData["bins"][0]) => void;
}

export function HistogramChart({ data, gradeRanges, onBinClick }: HistogramChartProps) {
  if (!data.bins || data.bins.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  // Prepare chart data
  const chartData = data.bins.map((bin) => ({
    range: bin.range_label,
    count: bin.count,
    percentage: bin.percentage,
    min: bin.min,
    max: bin.max,
    gradeBreakdown: bin.grade_breakdown,
  }));

  // Create grade boundary lines if grade ranges provided
  // Note: ReferenceLine with x prop requires the x value to match data points
  // For now, we'll skip the boundary lines as they need to be calculated per bin
  // This can be enhanced later if needed

  const chartConfig = {
    count: {
      label: "Count",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="range"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Count", angle: -90, position: "insideLeft" }}
          allowDecimals={false}
          tickFormatter={(value) => Math.round(value).toString()}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, props) => {
                const payload = props.payload as typeof chartData[0];
                return [
                  <div key="main" className="space-y-1">
                    <div className="font-medium">{payload.range}</div>
                    <div className="text-sm font-semibold">
                      Count: {Math.round(payload.count)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {payload.percentage.toFixed(1)}% of total
                    </div>
                    {payload.gradeBreakdown && Object.keys(payload.gradeBreakdown).length > 0 && (
                      <div className="text-xs mt-2 pt-2 border-t">
                        <div className="font-medium mb-1">Grade Breakdown:</div>
                        {Object.entries(payload.gradeBreakdown).map(([grade, count]) => (
                          <div key={grade} className="flex justify-between gap-2">
                            <span>{grade}:</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>,
                  null,
                ];
              }}
            />
          }
        />
        <Bar
          dataKey="count"
          fill="var(--color-count)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
