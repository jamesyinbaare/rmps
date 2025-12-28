"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubjectPerformanceStatistics } from "@/lib/api";

interface StatisticsCardsProps {
  statistics: SubjectPerformanceStatistics;
}

interface StatCardProps {
  title: string;
  description: string;
  value: string | number;
}

function StatCard({ title, description, value }: StatCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CombinedStatCardProps {
  title: string;
  description: string;
  items: Array<{ label: string; value: string | number }>;
}

function CombinedStatCard({ title, description, items }: CombinedStatCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-xs text-muted-foreground mt-1">{description}</div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-6">
          {items.map((item, index) => (
            <div key={index} className="flex-1 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {item.label}
              </div>
              <div className="text-2xl font-bold">{item.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatisticsCards({ statistics }: StatisticsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
      {/* Row 1: Central Tendency and Standard Deviation */}
      <CombinedStatCard
        title="Central Tendency"
        description="Average and median scores"
        items={[
          {
            label: "Average",
            value:
              statistics.mean_score !== null ? statistics.mean_score.toFixed(2) : "—",
          },
          {
            label: "Median",
            value:
              statistics.median_score !== null ? statistics.median_score.toFixed(2) : "—",
          },
        ]}
      />

      <StatCard
        title="Standard Deviation"
        description="Measure of score spread"
        value={
          statistics.std_deviation !== null ? statistics.std_deviation.toFixed(2) : "—"
        }
      />

      {/* Row 2: Distribution Measures */}
      <StatCard
        title="Skewness"
        description="Distribution asymmetry measure"
        value={
          statistics.skewness !== null ? statistics.skewness.toFixed(2) : "—"
        }
      />

      <StatCard
        title="Kurtosis"
        description="Distribution tail heaviness"
        value={
          statistics.kurtosis !== null ? statistics.kurtosis.toFixed(2) : "—"
        }
      />

      {/* Row 3: Quartiles and Score Range */}
      <CombinedStatCard
        title="Quartiles"
        description="First and third quartile scores"
        items={[
          {
            label: "Q1",
            value:
              statistics.percentiles?.["25th"] !== undefined
                ? statistics.percentiles["25th"].toFixed(2)
                : "—",
          },
          {
            label: "Q3",
            value:
              statistics.percentiles?.["75th"] !== undefined
                ? statistics.percentiles["75th"].toFixed(2)
                : "—",
          },
        ]}
      />

      <CombinedStatCard
        title="Score Range"
        description="Minimum and maximum scores"
        items={[
          {
            label: "Minimum",
            value:
              statistics.min_score !== null ? statistics.min_score.toFixed(2) : "—",
          },
          {
            label: "Maximum",
            value:
              statistics.max_score !== null ? statistics.max_score.toFixed(2) : "—",
          },
        ]}
      />
    </div>
  );
}
