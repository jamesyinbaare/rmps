"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getSubjectPerformanceStatistics,
  getSubjectHistogram,
  getSubjectRawScores,
  getSubjectFilterOptions,
  getGradeRanges,
  type SubjectPerformanceStatistics as StatsType,
  type HistogramData,
  type FilterOptions,
  type ExamSubject,
} from "@/lib/api";
import { HistogramChart } from "@/components/HistogramChart";
import { StatisticsCards } from "@/components/StatisticsCards";
import { ComprehensiveStatisticsPanel } from "@/components/ComprehensiveStatisticsPanel";
import { ScoreDistributionWithNormalCurve } from "@/components/ScoreDistributionWithNormalCurve";
import { BoundaryMethodGradeDistribution } from "@/components/BoundaryMethodGradeDistribution";
import { FilterPanel } from "@/components/FilterPanel";
import { InclusionOptionsPanel } from "@/components/InclusionOptionsPanel";
import { ScoresAnalysisPanel } from "@/components/ScoresAnalysisPanel";
import { Loader2, AlertCircle, BarChart3 } from "lucide-react";

interface SubjectInsightsPlaygroundProps {
  examId: number;
  subjects: ExamSubject[];
}

export function SubjectInsightsPlayground({
  examId,
  subjects,
}: SubjectInsightsPlaygroundProps) {
  const [selectedExamSubjectId, setSelectedExamSubjectId] = useState<number | null>(null);
  const [filters, setFilters] = useState<{
    region: string | null;
    zone: string | null;
    schoolId: number | null;
  }>({
    region: null,
    zone: null,
    schoolId: null,
  });
  const [binSize, setBinSize] = useState(5);
  const [includePending, setIncludePending] = useState(false);
  const [includeAbsent, setIncludeAbsent] = useState(false);

  const [statistics, setStatistics] = useState<StatsType | null>(null);
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [scores, setScores] = useState<number[]>([]); // For Score Distribution with Normal Curve (from histogram)
  const [rawScores, setRawScores] = useState<number[]>([]); // For Grade Distribution (actual raw scores)
  const [updatedSubject, setUpdatedSubject] = useState<ExamSubject | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseSubject = subjects.find((s) => s.id === selectedExamSubjectId);
  const selectedSubject = updatedSubject || baseSubject;

  // Convert filters to API format (null -> undefined)
  const filterParams = useMemo(
    () => ({
      region: filters.region || undefined,
      zone: filters.zone || undefined,
      schoolId: filters.schoolId || undefined,
    }),
    [filters.region, filters.zone, filters.schoolId]
  );

  // Reset updated subject when selected subject changes
  useEffect(() => {
    setUpdatedSubject(null);
  }, [selectedExamSubjectId]);

  // Load filter options when subject changes
  useEffect(() => {
    if (!selectedExamSubjectId) {
      setFilterOptions(null);
      return;
    }

    const loadFilterOptions = async () => {
      try {
        const options = await getSubjectFilterOptions(selectedExamSubjectId);
        setFilterOptions(options);
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    };

    loadFilterOptions();
  }, [selectedExamSubjectId]);

  // Load statistics and histogram
  const loadData = useCallback(async () => {
    if (!selectedExamSubjectId) {
      setStatistics(null);
      setHistogram(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [statsData, histData, rawScoresData] = await Promise.all([
        getSubjectPerformanceStatistics(
          selectedExamSubjectId,
          filterParams,
          undefined,
          includePending,
          includeAbsent
        ),
        getSubjectHistogram(
          selectedExamSubjectId,
          binSize,
          filterParams,
          undefined,
          includePending,
          includeAbsent
        ),
        getSubjectRawScores(
          selectedExamSubjectId,
          filterParams,
          includePending,
          includeAbsent
        ),
      ]);

      setStatistics(statsData);
      setHistogram(histData);

      // Extract scores from histogram bins for visualization (for Score Distribution with Normal Curve)
      const extractedScores: number[] = [];
      if (histData.bins && histData.bins.length > 0) {
        histData.bins.forEach((bin) => {
          // Approximate scores in each bin (use bin midpoint)
          const binMid = (bin.min + bin.max) / 2;
          for (let i = 0; i < bin.count; i++) {
            extractedScores.push(binMid);
          }
        });
      }
      setScores(extractedScores.length > 0 ? extractedScores : []);

      // Use actual raw scores for Grade Distribution (not affected by binSize)
      setRawScores(rawScoresData.scores || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights data");
      console.error("Failed to load insights:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedExamSubjectId, filterParams, binSize, includePending, includeAbsent]);

  // Load data when dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGradeRangesUpdate = async () => {
    // Reload grade ranges and update selected subject
    if (selectedExamSubjectId) {
      try {
        const gradeRangesData = await getGradeRanges(selectedExamSubjectId);
        if (baseSubject) {
          setUpdatedSubject({
            ...baseSubject,
            grade_ranges_json: gradeRangesData.grade_ranges,
          });
        }
        // Also reload statistics to reflect new ranges
        loadData();
      } catch (err) {
        console.error("Failed to reload grade ranges:", err);
      }
    }
  };

  if (subjects.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No subjects available for this examination.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subject Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Select Subject
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SearchableSelect
            options={subjects.map((subject) => ({
              value: subject.id.toString(),
              label: `${subject.subject_code} - ${subject.subject_name} (${subject.subject_type})`,
            }))}
            value={selectedExamSubjectId?.toString() || undefined}
            onValueChange={(value) => {
              setSelectedExamSubjectId(value ? parseInt(value) : null);
              setFilters({ region: null, zone: null, schoolId: null });
            }}
            placeholder="Select a subject to analyze"
            searchPlaceholder="Search subjects..."
            emptyMessage="No subjects found."
          />
        </CardContent>
      </Card>

      {!selectedExamSubjectId ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please select a subject to view insights.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          {/* Row 1: Filters + Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="lg:col-span-1">
              <FilterPanel
                filterOptions={filterOptions}
                filters={filters}
                onFiltersChange={setFilters}
                loading={loading}
              />
            </div>
            <div className="lg:col-span-2">
              {loading && !statistics ? (
                <Skeleton className="h-full" />
              ) : error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : statistics && histogram ? (
                <ComprehensiveStatisticsPanel statistics={statistics} />
              ) : null}
            </div>
          </div>

          {/* Row 2: Inclusion Options + Statistics Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="lg:col-span-1">
              <InclusionOptionsPanel
                includePending={includePending}
                includeAbsent={includeAbsent}
                onIncludePendingChange={setIncludePending}
                onIncludeAbsentChange={setIncludeAbsent}
                disabled={loading}
              />
            </div>
            <div className="lg:col-span-2">
              {loading && !statistics ? (
                <Skeleton className="h-full" />
              ) : error ? null : statistics && histogram ? (
                <StatisticsCards statistics={statistics} />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Full Width Sections */}
      {selectedExamSubjectId && statistics && histogram && (
        <div className="space-y-6 mt-6">
          {/* Score Distribution with Normal Curve */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Score Distribution with Normal Curve</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="bin-size" className="text-sm">
                    Bin Size:
                  </Label>
                  <Input
                    id="bin-size"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={binSize}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setBinSize(5);
                        return;
                      }
                      const numValue = parseInt(value, 10);
                      if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
                        setBinSize(numValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (isNaN(value) || value < 1) {
                        setBinSize(5);
                      } else if (value > 100) {
                        setBinSize(100);
                      }
                    }}
                    className="w-20 h-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScoreDistributionWithNormalCurve
                  scores={scores}
                  mean={statistics.mean_score}
                  stdDev={statistics.std_deviation}
                />
              )}
            </CardContent>
          </Card>

          {/* Grade Distribution by Boundary Method */}
          {selectedSubject && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Grade Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <BoundaryMethodGradeDistribution
                    scores={rawScores}
                    mean={statistics.mean_score}
                    stdDev={statistics.std_deviation}
                    examSubject={selectedSubject}
                    onGradeRangesUpdate={handleGradeRangesUpdate}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Scores Analysis */}
          {selectedExamSubjectId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scores Analysis Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoresAnalysisPanel
                  examSubjectId={selectedExamSubjectId}
                  filters={filterParams}
                  includePending={includePending}
                  includeAbsent={includeAbsent}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
