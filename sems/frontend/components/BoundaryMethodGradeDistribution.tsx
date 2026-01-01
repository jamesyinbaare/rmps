"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend, Cell, Pie, PieChart, LabelList } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ExamSubject, GradeRangeConfig } from "@/lib/api";
import { upsertGradeRanges } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, AlertCircle, Save } from "lucide-react";

interface BoundaryMethodGradeDistributionProps {
  scores: number[];
  mean?: number | null;
  stdDev?: number | null;
  examSubject?: ExamSubject | null;
  onGradeRangesUpdate?: () => void;
  testGradeRanges?: GradeRangeConfig[] | null;
}

type BoundaryMethod = "percentile_based" | "standards_based" | "hybrid";

const GRADE_ORDER = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass", "Fail"];

const GRADE_COLORS: Record<string, string> = {
  Distinction: "#FFD700",
  "Upper Credit": "#C0C0C0",
  Credit: "#CD7F32",
  "Lower Credit": "#87CEEB",
  Pass: "#90EE90",
  Fail: "#FFB6C1",
};

export function BoundaryMethodGradeDistribution({
  scores,
  mean,
  stdDev,
  examSubject,
  onGradeRangesUpdate,
  testGradeRanges,
}: BoundaryMethodGradeDistributionProps) {
  const [selectedMethod, setSelectedMethod] = useState<BoundaryMethod>("percentile_based");
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [tempRanges, setTempRanges] = useState<GradeRangeConfig[]>([]);
  const [savingRanges, setSavingRanges] = useState(false);

  const { boundaries, gradeDistribution } = useMemo(() => {
    if (!scores || scores.length === 0) {
      return { boundaries: {}, gradeDistribution: {} };
    }

    const sortedScores = [...scores].sort((a, b) => a - b);
    let boundaries: Record<string, number> = {};


    if (selectedMethod === "percentile_based") {
      const percentiles = {
        DISTINCTION: 95,
        UPPER_CREDIT: 80,
        CREDIT: 50,
        LOWER_CREDIT: 20,
        PASS: 5,
      };

      for (const [grade, percentile] of Object.entries(percentiles)) {
        const index = Math.floor((percentile / 100) * Math.max(0, sortedScores.length - 1));
        boundaries[grade] = sortedScores[index] || 0;
      }
      boundaries.FAIL = 0;
    } else if (selectedMethod === "standards_based") {
      // Use grade_ranges_json or testGradeRanges - required for standards-based method
      if (!examSubject) {
        // No exam subject provided - return empty boundaries
        return { boundaries: {}, gradeDistribution: {} };
      }

      // Prefer testGradeRanges if provided, otherwise use examSubject.grade_ranges_json
      const gradeRanges = testGradeRanges || examSubject.grade_ranges_json;

      if (!gradeRanges || !Array.isArray(gradeRanges) || gradeRanges.length === 0) {
        // No grade ranges set - return empty boundaries
        return { boundaries: {}, gradeDistribution: {} };
      }

      // Extract min values from grade_ranges_json for boundaries
      // Use min as the cutoff for each grade
      gradeRanges.forEach((gr) => {
        if (gr.min !== null && gr.min !== undefined) {
          // Map grade names to our internal format
          const gradeKey = gr.grade.toUpperCase().replace(/\s+/g, "_");
          if (gradeKey === "DISTINCTION") {
            boundaries.DISTINCTION = gr.min;
          } else if (gradeKey === "UPPER_CREDIT") {
            boundaries.UPPER_CREDIT = gr.min;
          } else if (gradeKey === "CREDIT") {
            boundaries.CREDIT = gr.min;
          } else if (gradeKey === "LOWER_CREDIT") {
            boundaries.LOWER_CREDIT = gr.min;
          } else if (gradeKey === "PASS") {
            boundaries.PASS = gr.min;
          } else if (gradeKey === "FAIL") {
            boundaries.FAIL = gr.min;
          }
        }
      });

      // Ensure FAIL is set (default to 0 if not in ranges)
      if (boundaries.FAIL === undefined) {
        boundaries.FAIL = 0;
      }
    } else if (selectedMethod === "hybrid") {
      const percentiles = {
        DISTINCTION: 95,
        UPPER_CREDIT: 80,
        CREDIT: 50,
        LOWER_CREDIT: 20,
        PASS: 5,
      };

      for (const [grade, percentile] of Object.entries(percentiles)) {
        const index = Math.floor((percentile / 100) * Math.max(0, sortedScores.length - 1));
        boundaries[grade] = sortedScores[index] || 0;
      }

      // Ensure minimum gap of 5 marks
      const gradeOrder = ["DISTINCTION", "UPPER_CREDIT", "CREDIT", "LOWER_CREDIT", "PASS"];
      for (let i = 0; i < gradeOrder.length - 1; i++) {
        const higher = gradeOrder[i];
        const lower = gradeOrder[i + 1];
        const gap = boundaries[higher] - boundaries[lower];
        if (gap < 5) {
          boundaries[higher] = boundaries[lower] + 5;
        }
      }
      boundaries.FAIL = 0;
    }

    // Calculate grade distribution
    const gradeDist: Record<string, number> = {};

    if (selectedMethod === "standards_based") {
      // For standards-based, use the actual grade ranges (min/max) from grade_ranges_json or testGradeRanges
      const gradeRanges = testGradeRanges || examSubject?.grade_ranges_json;

      if (!gradeRanges || !Array.isArray(gradeRanges) || gradeRanges.length === 0) {
        // No grade ranges available
        GRADE_ORDER.forEach((grade) => {
          gradeDist[grade] = 0;
        });
      } else {
        // Initialize all grades to 0
        GRADE_ORDER.forEach((grade) => {
          gradeDist[grade] = 0;
        });

      // For each score, find which grade range it falls into
      scores.forEach((score) => {
        for (const range of gradeRanges) {
          if (
            range.min !== null &&
            range.max !== null &&
            score >= range.min &&
            score <= range.max
          ) {
            // Grade names in grade_ranges_json should match GRADE_ORDER exactly
            // (e.g., "Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass", "Fail")
            const gradeName = range.grade;

            // Direct match
            if (GRADE_ORDER.includes(gradeName)) {
              gradeDist[gradeName]++;
            } else {
              // Try case-insensitive match
              const matchedGrade = GRADE_ORDER.find(
                (g) => g.toLowerCase() === gradeName.toLowerCase()
              );
              if (matchedGrade) {
                gradeDist[matchedGrade]++;
              }
            }
            break; // Found the grade, move to next score
          }
        }
      });
      }
    } else {
      // For percentile-based and hybrid, use boundaries approach
      const sortedBoundaries = Object.entries(boundaries)
        .filter(([g]) => g !== "FAIL")
        .sort(([, a], [, b]) => b - a);

      for (const [grade, cutoff] of sortedBoundaries) {
        if (grade === "DISTINCTION") {
          gradeDist.Distinction = scores.filter((s) => s >= cutoff).length;
        } else {
          const higherCutoffs = sortedBoundaries
            .filter(([g, c]) => c > cutoff)
            .map(([, c]) => c);
          const nextHigher = higherCutoffs.length > 0 ? Math.min(...higherCutoffs) : Infinity;
          let gradeName: string;
          if (grade === "UPPER_CREDIT") {
            gradeName = "Upper Credit";
          } else if (grade === "LOWER_CREDIT") {
            gradeName = "Lower Credit";
          } else if (grade === "PASS") {
            gradeName = "Pass";
          } else if (grade === "CREDIT") {
            gradeName = "Credit";
          } else {
            gradeName = grade;
          }
          gradeDist[gradeName] = scores.filter(
            (s) => s >= cutoff && s < nextHigher
          ).length;
        }
      }

      const passed = Object.values(gradeDist).reduce((a, b) => a + b, 0);
      gradeDist.Fail = scores.length - passed;
    }

    return { boundaries, gradeDistribution: gradeDist };
  }, [scores, selectedMethod, mean, examSubject, testGradeRanges]);

  const chartData = useMemo(() => {
    return GRADE_ORDER.map((grade) => ({
      grade,
      count: gradeDistribution[grade] || 0,
      percentage: scores.length > 0 ? ((gradeDistribution[grade] || 0) / scores.length) * 100 : 0,
    }));
  }, [gradeDistribution, scores.length]);

  if (!scores || scores.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No score data available
      </div>
    );
  }

  const chartConfig = GRADE_ORDER.reduce((acc, grade) => {
    acc[grade] = {
      label: grade,
      color: GRADE_COLORS[grade] || "hsl(var(--chart-1))",
    };
    return acc;
  }, {} as ChartConfig);

  // Initialize temp ranges when showing editor
  const initializeRangeEditor = () => {
    if (examSubject?.grade_ranges_json && examSubject.grade_ranges_json.length > 0) {
      // Use existing ranges, but ensure all grades are present
      const existingMap = new Map(
        examSubject.grade_ranges_json.map((gr) => [gr.grade, gr])
      );
      const allGrades = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass", "Fail"];
      const ranges = allGrades.map((grade) => {
        const existing = existingMap.get(grade);
        return existing || { grade, min: null, max: null };
      });
      setTempRanges(ranges);
    } else {
      // Default ranges
      setTempRanges([
        { grade: "Distinction", min: 85, max: 100 },
        { grade: "Upper Credit", min: 75, max: 84 },
        { grade: "Credit", min: 65, max: 74 },
        { grade: "Lower Credit", min: 55, max: 64 },
        { grade: "Pass", min: 45, max: 54 },
        { grade: "Fail", min: 0, max: 44 },
      ]);
    }
    setShowRangeEditor(true);
  };

  const handleSaveRanges = async () => {
    if (!examSubject) return;

    setSavingRanges(true);
    try {
      await upsertGradeRanges(examSubject.id, tempRanges);
      toast.success("Grade ranges saved successfully");
      setShowRangeEditor(false);
      if (onGradeRangesUpdate) {
        onGradeRangesUpdate();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save grade ranges");
    } finally {
      setSavingRanges(false);
    }
  };

  const needsRangeSetup = selectedMethod === "standards_based" &&
    (!examSubject?.grade_ranges_json || examSubject.grade_ranges_json.length === 0);

  return (
    <div className="relative overflow-hidden">
      <Tabs value={chartType} onValueChange={(value) => setChartType(value as "bar" | "pie")}>
        <div className="space-y-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Select value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as BoundaryMethod)}>
                <SelectTrigger id="boundary-method" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentile_based">Percentile-Based</SelectItem>
                  <SelectItem value="standards_based">Standards-Based</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
              <TabsList>
                <TabsTrigger value="bar">Bar Chart</TabsTrigger>
                <TabsTrigger value="pie">Pie Chart</TabsTrigger>
              </TabsList>
            </div>
            {selectedMethod === "standards_based" && examSubject && (
              <Button
                variant="outline"
                size="sm"
                onClick={initializeRangeEditor}
              >
                {examSubject.grade_ranges_json && examSubject.grade_ranges_json.length > 0
                  ? "Edit Ranges"
                  : "Set Ranges"}
              </Button>
            )}
          </div>

          {needsRangeSetup && !showRangeEditor && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Grade ranges are not set. Please set them to use the standards-based method.
              </AlertDescription>
            </Alert>
          )}

        <TabsContent value="bar" className="relative">
          <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="grade"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                label={{ value: "Grade", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                label={{ value: "Number of Students", angle: -90, position: "insideLeft" }}
                allowDecimals={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, props) => {
                      const payload = props.payload as typeof chartData[0];
                      return [
                        <div key="main" className="space-y-1">
                          <div className="font-medium">{payload.grade}</div>
                          <div className="text-sm font-semibold">Count: {payload.count}</div>
                          <div className="text-xs text-muted-foreground">
                            {payload.percentage.toFixed(1)}% of total
                          </div>
                        </div>,
                        "Students",
                      ];
                    }}
                  />
                }
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={GRADE_COLORS[entry.grade] || "hsl(var(--chart-1))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </TabsContent>
        <TabsContent value="pie" className="relative">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[400px] w-full overflow-visible"
          >
            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name, props) => {
                      const payload = props.payload as typeof chartData[0];
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
                data={chartData}
                dataKey="count"
                nameKey="grade"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label={(entry: typeof chartData[0]) => `${entry.grade}: ${entry.percentage.toFixed(1)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={GRADE_COLORS[entry.grade] || "hsl(var(--chart-1))"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </TabsContent>

        {/* Backdrop overlay - appears on top of active tab content */}
        {showRangeEditor && (
          <div
            className="absolute inset-0 bg-black/50 z-40 transition-opacity duration-300 rounded-lg pointer-events-auto"
            onClick={() => setShowRangeEditor(false)}
          />
        )}

        {/* Slide-in Range Editor from left - appears on top of active tab content */}
        <div
          className={`absolute left-0 top-0 h-full min-w-[80%] w-[80%] z-50 bg-background shadow-2xl transition-transform duration-300 ease-in-out rounded-r-lg pointer-events-auto ${
            showRangeEditor ? "translate-x-0" : "-translate-x-full pointer-events-none"
          }`}
        >
          <Card className="h-full rounded-none border-0 shadow-none">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Set Grade Ranges</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRangeEditor(false)}
                  className="h-8 w-8 p-0"
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col h-[calc(100%-80px)] p-6">
              <div className="flex-1 space-y-3 overflow-hidden">
                {tempRanges.map((range, index) => (
                  <div key={range.grade} className="flex items-center gap-4">
                    <Label className="w-32 text-base font-medium whitespace-nowrap">{range.grade}:</Label>
                    <Input
                      type="number"
                      placeholder="Min"
                      value={range.min ?? ""}
                      onChange={(e) => {
                        const newRanges = [...tempRanges];
                        newRanges[index] = {
                          ...newRanges[index],
                          min: e.target.value === "" ? null : parseFloat(e.target.value),
                        };
                        setTempRanges(newRanges);
                      }}
                      className="w-28 h-10"
                      min="0"
                      max="100"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={range.max ?? ""}
                      onChange={(e) => {
                        const newRanges = [...tempRanges];
                        newRanges[index] = {
                          ...newRanges[index],
                          max: e.target.value === "" ? null : parseFloat(e.target.value),
                        };
                        setTempRanges(newRanges);
                      }}
                      className="w-28 h-10"
                      min="0"
                      max="100"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-4 border-t mt-4">
                <Button onClick={handleSaveRanges} disabled={savingRanges}>
                  {savingRanges ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Ranges
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setShowRangeEditor(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </Tabs>
    </div>
  );
}
