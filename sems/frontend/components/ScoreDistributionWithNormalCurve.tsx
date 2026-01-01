"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, XAxis, YAxis, Line, ComposedChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface ScoreDistributionWithNormalCurveProps {
  scores: number[];
  mean?: number | null;
  stdDev?: number | null;
}

export function ScoreDistributionWithNormalCurve({
  scores,
  mean,
  stdDev,
}: ScoreDistributionWithNormalCurveProps) {
  const chartData = useMemo(() => {
    if (!scores || scores.length === 0) return [];

    const minScore = 0;
    const maxScore = 100;
    const binCount = 40;
    const binSize = (maxScore - minScore) / binCount;

    const bins: Array<{
      score: number;
      range: string;
      count: number;
      normalCurve: number | null;
    }> = [];

    // Calculate normal curve values if mean and stdDev are available
    const calculateNormalPDF = (x: number, mu: number, sigma: number): number => {
      if (sigma === 0) return 0;
      const coefficient = 1 / (sigma * Math.sqrt(2 * Math.PI));
      const exponent = -0.5 * Math.pow((x - mu) / sigma, 2);
      return coefficient * Math.exp(exponent);
    };

    for (let i = 0; i < binCount; i++) {
      const binMin = minScore + i * binSize;
      const binMax = binMin + binSize;
      const mid = (binMin + binMax) / 2;
      const count = scores.filter((s) => s >= binMin && s < binMax).length;

      // Calculate normal curve value at bin midpoint
      let normalCurve: number | null = null;
      if (mean !== null && mean !== undefined && stdDev !== null && stdDev !== undefined && stdDev > 0) {
        const pdfValue = calculateNormalPDF(mid, mean, stdDev);
        // Scale to match the histogram scale (multiply by total count and bin width)
        normalCurve = pdfValue * scores.length * binSize;
      }

      bins.push({
        score: mid,
        range: `${Math.round(binMin)}-${Math.round(binMax)}`,
        count,
        normalCurve,
      });
    }

    return bins;
  }, [scores, mean, stdDev]);

  if (!scores || scores.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No score data available
      </div>
    );
  }

  const chartConfig = {
    count: {
      label: "Frequency",
      color: "hsl(var(--chart-1))",
    },
    normalCurve: {
      label: "Normal Curve",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="score"
          type="number"
          scale="linear"
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
                    {payload.normalCurve !== null && (
                      <div className="text-xs text-muted-foreground">
                        Normal: {payload.normalCurve.toFixed(1)}
                      </div>
                    )}
                  </div>,
                  name === "count" ? "Frequency" : "Normal Curve",
                ];
              }}
              labelFormatter={(label) => `Score: ${Math.round(Number(label))}`}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
        {mean !== null && mean !== undefined && stdDev !== null && stdDev !== undefined && stdDev > 0 && (
          <Line
            type="monotone"
            dataKey="normalCurve"
            stroke="var(--color-normalCurve)"
            strokeWidth={2}
            dot={false}
            name="Normal Curve"
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
