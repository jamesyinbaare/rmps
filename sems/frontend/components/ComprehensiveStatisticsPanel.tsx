"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubjectPerformanceStatistics } from "@/lib/api";

interface ComprehensiveStatisticsPanelProps {
  statistics: SubjectPerformanceStatistics;
}

export function ComprehensiveStatisticsPanel({
  statistics,
}: ComprehensiveStatisticsPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Summary</h2>
          <CardTitle className="text-base">Number of Candidates</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{statistics.total_candidates}</div>
              <div className="text-sm text-muted-foreground">total candidates</div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Processed</div>
                <div className="text-xl font-semibold">{statistics.processed_candidates}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Absent</div>
                <div className="text-xl font-semibold">{statistics.absent_candidates}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Pending</div>
                <div className="text-xl font-semibold">{statistics.pending_candidates}</div>
              </div>
            </div>
          </div>
        </CardContent>
    </Card>
  );
}
