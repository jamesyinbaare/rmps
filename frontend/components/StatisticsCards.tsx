"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubjectPerformanceStatistics } from "@/lib/api";

interface StatisticsCardsProps {
  statistics: SubjectPerformanceStatistics;
}

export function StatisticsCards({ statistics }: StatisticsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Candidate Counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statistics.total_candidates}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {statistics.processed_candidates} processed, {statistics.absent_candidates} absent,{" "}
            {statistics.pending_candidates} pending
          </div>
        </CardContent>
      </Card>

      {/* Mean Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Mean Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {statistics.mean_score !== null ? statistics.mean_score.toFixed(2) : "—"}
          </div>
          {statistics.std_deviation !== null && (
            <div className="text-xs text-muted-foreground mt-1">
              Std Dev: {statistics.std_deviation.toFixed(2)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Median Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Median Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {statistics.median_score !== null ? statistics.median_score.toFixed(2) : "—"}
          </div>
          {statistics.percentiles && (
            <div className="text-xs text-muted-foreground mt-1">
              Q1: {statistics.percentiles["25th"].toFixed(1)}, Q3:{" "}
              {statistics.percentiles["75th"].toFixed(1)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Range */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Score Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {statistics.min_score !== null && statistics.max_score !== null
              ? `${statistics.min_score.toFixed(1)} - ${statistics.max_score.toFixed(1)}`
              : "—"}
          </div>
          {statistics.percentiles && (
            <div className="text-xs text-muted-foreground mt-1">
              90th: {statistics.percentiles["90th"].toFixed(1)}, 95th:{" "}
              {statistics.percentiles["95th"].toFixed(1)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass Rate */}
      {statistics.pass_rate !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.pass_rate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {statistics.grade_distribution["Pass"] || 0} passed out of{" "}
              {statistics.processed_candidates} processed
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
