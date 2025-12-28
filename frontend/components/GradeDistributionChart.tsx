"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SubjectPerformanceStatistics } from "@/lib/api";

interface GradeDistributionChartProps {
  statistics: SubjectPerformanceStatistics;
  chartType?: "pie" | "bar";
}

const GRADE_COLORS: Record<string, string> = {
  Fail: "var(--chart-1)",
  Pass: "var(--chart-2)",
  "Lower Credit": "var(--chart-3)",
  Credit: "var(--chart-4)",
  "Upper Credit": "var(--chart-5)",
  Distinction: "var(--chart-6)",
};

export function GradeDistributionChart({
  statistics,
  chartType = "pie",
}: GradeDistributionChartProps) {
  const gradeData = Object.entries(statistics.grade_distribution).map(([grade, count]) => ({
    grade,
    count,
    percentage: statistics.grade_percentages[grade] || 0,
    fill: GRADE_COLORS[grade] || "var(--chart-1)",
  }));

  if (gradeData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No grade distribution data available
      </div>
    );
  }

  const chartConfig = gradeData.reduce(
    (acc, item) => {
      acc[item.grade.toLowerCase().replace(/\s+/g, "_")] = {
        label: item.grade,
        color: item.fill,
      };
      return acc;
    },
    {} as ChartConfig
  );

  if (chartType === "pie") {
    return (
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[300px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name, props) => {
                  const payload = props.payload as typeof gradeData[0];
                  return [
                    <div key="tooltip" className="space-y-1">
                      <div className="font-medium">{payload.grade}</div>
                      <div className="text-sm">
                        Count: {payload.count} ({payload.percentage.toFixed(1)}%)
                      </div>
                    </div>,
                    null,
                  ];
                }}
              />
            }
          />
          <Pie
            data={gradeData}
            dataKey="count"
            nameKey="grade"
            label={(entry) => `${entry.grade}: ${entry.percentage.toFixed(1)}%`}
          />
        </PieChart>
      </ChartContainer>
    );
  }

  // Bar chart
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={gradeData}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="grade"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          label={{ value: "Count", angle: -90, position: "insideLeft" }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, props) => {
                const payload = props.payload as typeof gradeData[0];
                return [
                  <div key="tooltip" className="space-y-1">
                    <div className="font-medium">{payload.grade}</div>
                    <div className="text-sm">
                      Count: {payload.count} ({payload.percentage.toFixed(1)}%)
                    </div>
                  </div>,
                  null,
                ];
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {gradeData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
