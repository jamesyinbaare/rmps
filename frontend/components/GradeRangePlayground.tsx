"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { GradeRangeConfig, ExamSubject } from "@/lib/api";
import { upsertGradeRanges } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";

const GRADE_NAMES = [
  "Fail",
  "Pass",
  "Lower Credit",
  "Credit",
  "Upper Credit",
  "Distinction",
] as const;

interface GradeRangePlaygroundProps {
  examSubject: ExamSubject;
  testGradeRanges: GradeRangeConfig[] | null;
  onTestGradeRangesChange: (ranges: GradeRangeConfig[] | null) => void;
  onApply: () => void;
}

export function GradeRangePlayground({
  examSubject,
  testGradeRanges,
  onTestGradeRangesChange,
  onApply,
}: GradeRangePlaygroundProps) {
  const [loading, setLoading] = useState(false);
  const [currentRanges, setCurrentRanges] = useState<GradeRangeConfig[]>([]);
  const [testRanges, setTestRanges] = useState<GradeRangeConfig[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize current ranges from exam subject
  useEffect(() => {
    if (examSubject.grade_ranges_json && examSubject.grade_ranges_json.length > 0) {
      const existingGrades = new Map(
        examSubject.grade_ranges_json.map((gr) => [gr.grade, gr])
      );
      const initialData: GradeRangeConfig[] = GRADE_NAMES.map((gradeName) => {
        const existing = existingGrades.get(gradeName);
        return existing || { grade: gradeName, min: null, max: null };
      });
      setCurrentRanges(initialData);
    } else {
      setCurrentRanges(
        GRADE_NAMES.map((gradeName) => ({
          grade: gradeName,
          min: null,
          max: null,
        }))
      );
    }
  }, [examSubject.grade_ranges_json]);

  // Initialize test ranges
  useEffect(() => {
    if (testGradeRanges) {
      setTestRanges(testGradeRanges);
    } else {
      setTestRanges([...currentRanges]);
    }
  }, [testGradeRanges, currentRanges]);

  const handleTestChange = (gradeIndex: number, field: "min" | "max", value: string) => {
    const newRanges = [...testRanges];
    const numValue = value === "" ? null : parseFloat(value);
    newRanges[gradeIndex] = {
      ...newRanges[gradeIndex],
      [field]: numValue,
    };
    setTestRanges(newRanges);
    onTestGradeRangesChange(newRanges);
    setValidationError(null);
  };

  const validateRanges = (ranges: GradeRangeConfig[]): string | null => {
    const validRanges = ranges.filter((gr) => gr.min !== null && gr.max !== null);

    if (validRanges.length === 0) {
      return null;
    }

    for (const gr of validRanges) {
      if (gr.min! > gr.max!) {
        return `${gr.grade}: min cannot be greater than max`;
      }
      if (gr.min! < 0 || gr.max! > 100) {
        return `${gr.grade}: scores must be between 0 and 100`;
      }
    }

    const sortedRanges = [...validRanges].sort((a, b) => a.min! - b.min!);

    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const current = sortedRanges[i];
      const next = sortedRanges[i + 1];
      if (current.max! >= next.min!) {
        return `Ranges overlap: ${current.grade} (${current.min}-${current.max}) overlaps with ${next.grade} (${next.min}-${next.max})`;
      }
    }

    const minMin = Math.min(...validRanges.map((gr) => gr.min!));
    const maxMax = Math.max(...validRanges.map((gr) => gr.max!));

    if (minMin > 0) {
      return `Ranges do not cover full range. Lowest min is ${minMin}, should start at 0`;
    }
    if (maxMax < 100) {
      return `Ranges do not cover full range. Highest max is ${maxMax}, should end at 100`;
    }

    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const current = sortedRanges[i];
      const next = sortedRanges[i + 1];
      const gapSize = next.min! - current.max!;
      if (gapSize > 1.01) {
        return `Ranges have a gap: ${current.grade} ends at ${current.max} but ${next.grade} starts at ${next.min}`;
      }
    }

    return null;
  };

  const handleApply = async () => {
    const error = validateRanges(testRanges);
    if (error) {
      setValidationError(error);
      return;
    }

    setLoading(true);
    try {
      await upsertGradeRanges(examSubject.id, testRanges);
      toast.success("Grade ranges updated successfully");
      onApply();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update grade ranges";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTestRanges([...currentRanges]);
    onTestGradeRangesChange(null);
    setValidationError(null);
  };

  const hasChanges = JSON.stringify(currentRanges) !== JSON.stringify(testRanges);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Grade Range Playground</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasChanges || loading}
          >
            <X className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!hasChanges || loading || !!validationError}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Apply Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current Ranges */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Current Grade Ranges
              <Badge variant="secondary">Saved</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4 text-sm font-medium border-b pb-2">
                <div>Grade</div>
                <div>Min</div>
                <div>Max</div>
                <div>Range</div>
              </div>
              {currentRanges.map((gradeRange) => (
                <div key={gradeRange.grade} className="grid grid-cols-4 gap-4 items-center text-sm">
                  <div className="font-medium">{gradeRange.grade}</div>
                  <div className="text-muted-foreground">
                    {gradeRange.min !== null ? gradeRange.min : "—"}
                  </div>
                  <div className="text-muted-foreground">
                    {gradeRange.max !== null ? gradeRange.max : "—"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {gradeRange.min !== null && gradeRange.max !== null
                      ? `${gradeRange.min}-${gradeRange.max}`
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Test Ranges */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Test Grade Ranges
              <Badge variant={hasChanges ? "default" : "outline"}>
                {hasChanges ? "Modified" : "Unchanged"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4 text-sm font-medium border-b pb-2">
                <div>Grade</div>
                <div>Min</div>
                <div>Max</div>
                <div>Range</div>
              </div>
              {testRanges.map((gradeRange, index) => {
                const currentRange = currentRanges[index];
                const isChanged =
                  currentRange.min !== gradeRange.min || currentRange.max !== gradeRange.max;

                return (
                  <div
                    key={gradeRange.grade}
                    className={`grid grid-cols-4 gap-4 items-center text-sm ${
                      isChanged ? "bg-muted/50 rounded p-2" : ""
                    }`}
                  >
                    <div className="font-medium">{gradeRange.grade}</div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={gradeRange.min ?? ""}
                      onChange={(e) => handleTestChange(index, "min", e.target.value)}
                      placeholder="0"
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={gradeRange.max ?? ""}
                      onChange={(e) => handleTestChange(index, "max", e.target.value)}
                      placeholder="100"
                      className="h-8"
                    />
                    <div className="text-xs text-muted-foreground">
                      {gradeRange.min !== null && gradeRange.max !== null
                        ? `${gradeRange.min}-${gradeRange.max}`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
