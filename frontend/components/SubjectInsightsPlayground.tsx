"use client";

import { useState, useEffect, useCallback } from "react";
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
  getSubjectFilterOptions,
  type SubjectPerformanceStatistics as StatsType,
  type HistogramData,
  type FilterOptions,
  type GradeRangeConfig,
  type ExamSubject,
} from "@/lib/api";
import { HistogramChart } from "@/components/HistogramChart";
import { GradeDistributionChart } from "@/components/GradeDistributionChart";
import { StatisticsCards } from "@/components/StatisticsCards";
import { GradeRangePlayground } from "@/components/GradeRangePlayground";
import { FilterPanel } from "@/components/FilterPanel";
import { InclusionOptionsPanel } from "@/components/InclusionOptionsPanel";
import { Loader2, AlertCircle, BarChart3 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

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
  const [testGradeRanges, setTestGradeRanges] = useState<GradeRangeConfig[] | null>(null);
  const [includePending, setIncludePending] = useState(false);
  const [includeAbsent, setIncludeAbsent] = useState(false);

  const [statistics, setStatistics] = useState<StatsType | null>(null);
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSubject = subjects.find((s) => s.id === selectedExamSubjectId);

  // Debounce test grade ranges changes
  const debouncedTestGradeRanges = useDebounce(testGradeRanges, 500);

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
      const [statsData, histData] = await Promise.all([
        getSubjectPerformanceStatistics(
          selectedExamSubjectId,
          filters,
          debouncedTestGradeRanges || undefined,
          includePending,
          includeAbsent
        ),
        getSubjectHistogram(
          selectedExamSubjectId,
          binSize,
          filters,
          debouncedTestGradeRanges || undefined,
          includePending,
          includeAbsent
        ),
      ]);

      setStatistics(statsData);
      setHistogram(histData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights data");
      console.error("Failed to load insights:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedExamSubjectId, filters, binSize, debouncedTestGradeRanges, includePending, includeAbsent]);

  // Load data when dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyGradeRanges = () => {
    // Reload data after applying grade ranges
    loadData();
    setTestGradeRanges(null);
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
              setTestGradeRanges(null);
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Filters */}
          <div className="lg:col-span-1 space-y-4">
            <FilterPanel
              filterOptions={filterOptions}
              filters={filters}
              onFiltersChange={setFilters}
              loading={loading}
            />
            <InclusionOptionsPanel
              includePending={includePending}
              includeAbsent={includeAbsent}
              onIncludePendingChange={setIncludePending}
              onIncludeAbsentChange={setIncludeAbsent}
              disabled={loading}
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {loading && !statistics ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : statistics && histogram ? (
              <>
                {/* Statistics Cards */}
                <StatisticsCards statistics={statistics} />

                {/* Histogram */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Score Distribution</CardTitle>
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
                      <div className="flex items-center justify-center h-[300px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <HistogramChart
                        data={histogram}
                        gradeRanges={debouncedTestGradeRanges || selectedSubject?.grade_ranges_json || null}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Grade Distribution */}
                {statistics.grade_distribution && Object.keys(statistics.grade_distribution).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Grade Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="pie">
                        <TabsList>
                          <TabsTrigger value="pie">Pie Chart</TabsTrigger>
                          <TabsTrigger value="bar">Bar Chart</TabsTrigger>
                        </TabsList>
                        <TabsContent value="pie">
                          <GradeDistributionChart statistics={statistics} chartType="pie" />
                        </TabsContent>
                        <TabsContent value="bar">
                          <GradeDistributionChart statistics={statistics} chartType="bar" />
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                )}

                {/* Grade Range Playground */}
                {selectedSubject && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Grade Range Playground</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <GradeRangePlayground
                        examSubject={selectedSubject}
                        testGradeRanges={testGradeRanges}
                        onTestGradeRangesChange={setTestGradeRanges}
                        onApply={handleApplyGradeRanges}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
