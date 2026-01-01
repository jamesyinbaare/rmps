"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MethodAnalysis, MethodComparison } from "@/lib/api";
import { ScoreDistributionChart } from "./ScoreDistributionChart";
import { CumulativeDistributionChart } from "./CumulativeDistributionChart";
import { GradeDistributionComparisonChart } from "./GradeDistributionComparisonChart";
import { GapAnalysisChart } from "./GapAnalysisChart";
import { BorderlineCandidatesChart } from "./BorderlineCandidatesChart";
import { QualityMetricsTable } from "./QualityMetricsTable";

interface ScoresAnalysisDashboardProps {
  singleAnalysis?: MethodAnalysis | null;
  comparison?: MethodComparison | null;
  scores?: number[];
}

export function ScoresAnalysisDashboard({
  singleAnalysis,
  comparison,
  scores,
}: ScoresAnalysisDashboardProps) {
  // If we have comparison data, use it; otherwise use single analysis
  const hasComparison = comparison && comparison.methods.length > 0;
  const hasSingle = singleAnalysis !== null && singleAnalysis !== undefined;

  if (!hasComparison && !hasSingle) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No analysis data available. Please run an analysis first.
      </div>
    );
  }

  // For comparison mode, we need to prepare data for all methods
  const boundarySets = hasComparison
    ? comparison.methods.map((m) => ({
        name: m.method_name,
        boundaries: m.boundaries,
        gradeDistribution: m.grade_distribution,
        impactMetrics: m.impact_metrics,
      }))
    : singleAnalysis
    ? [
        {
          name: singleAnalysis.method_name,
          boundaries: singleAnalysis.boundaries.boundaries,
          gradeDistribution: singleAnalysis.grade_distribution,
          impactMetrics: singleAnalysis.impact_metrics,
        },
      ]
    : [];

  // Get score statistics from single analysis or calculate from scores
  const scoreStats = singleAnalysis?.score_statistics || null;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="distribution" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="cumulative">CDF</TabsTrigger>
          <TabsTrigger value="grade-comparison">Grade Comparison</TabsTrigger>
          <TabsTrigger value="gap-analysis">Gap Analysis</TabsTrigger>
          <TabsTrigger value="borderline">Borderline</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="distribution" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Distribution with Grade Zones</CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreDistributionChart
                scores={scores || []}
                boundarySets={boundarySets}
                scoreStats={scoreStats}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cumulative" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cumulative Distribution Function (CDF)</CardTitle>
            </CardHeader>
            <CardContent>
              <CumulativeDistributionChart scores={scores || []} boundarySets={boundarySets} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grade-comparison" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grade Distribution Under Different Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <GradeDistributionComparisonChart boundarySets={boundarySets} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gap-analysis" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gap Between Consecutive Grades</CardTitle>
            </CardHeader>
            <CardContent>
              <GapAnalysisChart boundarySets={boundarySets} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="borderline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Borderline Candidates Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <BorderlineCandidatesChart
                boundarySets={boundarySets}
                totalStudents={boundarySets[0]?.impactMetrics.total_students || 0}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quality Metrics by Method</CardTitle>
            </CardHeader>
            <CardContent>
              <QualityMetricsTable boundarySets={boundarySets} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
