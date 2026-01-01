"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { upsertGradeRanges, getGradeRanges, type GradeRangeConfig, type ExamSubject } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

interface GradeRangeModalProps {
  examSubject: ExamSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const GRADE_NAMES = [
  "Fail",
  "Pass",
  "Lower Credit",
  "Credit",
  "Upper Credit",
  "Distinction",
] as const;

export function GradeRangeModal({
  examSubject,
  open,
  onOpenChange,
  onSuccess,
}: GradeRangeModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [formData, setFormData] = useState<GradeRangeConfig[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize form data with all 6 grades
  useEffect(() => {
    const loadGradeRanges = async () => {
      if (open && examSubject) {
        setLoadingData(true);
        try {
          // Fetch grade ranges from API
          const result = await getGradeRanges(examSubject.id);
          const gradeRanges = result.grade_ranges;

          if (gradeRanges && gradeRanges.length > 0) {
            // Ensure all 6 grades are present, fill missing ones
            const existingGrades = new Map(
              gradeRanges.map((gr) => [gr.grade, gr])
            );
            const initialData: GradeRangeConfig[] = GRADE_NAMES.map((gradeName) => {
              const existing = existingGrades.get(gradeName);
              return existing || { grade: gradeName, min: null, max: null };
            });
            setFormData(initialData);
          } else {
            // Initialize with empty values for all grades
            setFormData(
              GRADE_NAMES.map((gradeName) => ({
                grade: gradeName,
                min: null,
                max: null,
              }))
            );
          }
        } catch (error) {
          console.error("Error loading grade ranges:", error);
          const errorMessage = error instanceof Error ? error.message : "Failed to load grade ranges";
          toast.error(errorMessage);
          // Initialize with empty values on error
          setFormData(
            GRADE_NAMES.map((gradeName) => ({
              grade: gradeName,
              min: null,
              max: null,
            }))
          );
        } finally {
          setLoadingData(false);
          setValidationError(null);
        }
      }
    };

    loadGradeRanges();
  }, [open, examSubject.id]);

  const handleChange = (gradeIndex: number, field: "min" | "max", value: string) => {
    setFormData((prev) => {
      const newData = [...prev];
      const numValue = value === "" ? null : parseFloat(value);
      newData[gradeIndex] = {
        ...newData[gradeIndex],
        [field]: numValue,
      };
      return newData;
    });
    setValidationError(null);
  };

  const validateRanges = (): string | null => {
    // Filter to only ranges with both min and max set
    const validRanges = formData.filter(
      (gr) => gr.min !== null && gr.max !== null
    );

    if (validRanges.length === 0) {
      return null; // Empty is valid (can be set later)
    }

    // Validate min <= max for each range
    for (const gr of validRanges) {
      if (gr.min! > gr.max!) {
        return `${gr.grade}: min (${gr.min}) cannot be greater than max (${gr.max})`;
      }
      if (gr.min! < 0 || gr.max! > 100) {
        return `${gr.grade}: scores must be between 0 and 100`;
      }
    }

    // Sort by min for overlap/gap detection
    const sortedRanges = [...validRanges].sort((a, b) => a.min! - b.min!);

    // Check for overlaps
    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const current = sortedRanges[i];
      const next = sortedRanges[i + 1];
      if (current.max! >= next.min!) {
        return `Grade ranges overlap: ${current.grade} (${current.min}-${current.max}) overlaps with ${next.grade} (${next.min}-${next.max})`;
      }
    }

    // Check coverage
    const minMin = Math.min(...validRanges.map((gr) => gr.min!));
    const maxMax = Math.max(...validRanges.map((gr) => gr.max!));

    if (minMin > 0) {
      return `Grade ranges do not cover the full range. Lowest min is ${minMin}, but should start at 0`;
    }
    if (maxMax < 100) {
      return `Grade ranges do not cover the full range. Highest max is ${maxMax}, but should end at 100`;
    }

    // Check for gaps
    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const current = sortedRanges[i];
      const next = sortedRanges[i + 1];
      // A gap exists if next.min > current.max + 1 (allowing small floating point errors)
      // Consecutive ranges (e.g., 39 and 40) are valid
      const gapSize = next.min! - current.max!;
      if (gapSize > 1.01) {
        return `Grade ranges have a gap: ${current.grade} ends at ${current.max} but ${next.grade} starts at ${next.min}`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    const error = validateRanges();
    if (error) {
      setValidationError(error);
      toast.error("Please fix validation errors before saving");
      return;
    }

    setLoading(true);
    setValidationError(null);
    try {
      const result = await upsertGradeRanges(examSubject.id, formData);
      toast.success("Grade ranges updated successfully");
      // Update examSubject with new grade_ranges_json
      examSubject.grade_ranges_json = result.grade_ranges;
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update grade ranges";
      toast.error(errorMessage);
      console.error("Error updating grade ranges:", error);
      // Don't close modal on error so user can try again
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setValidationError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Grade Ranges</DialogTitle>
          <DialogDescription>
            Configure grade ranges for {examSubject.subject_code} - {examSubject.subject_name}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4 text-sm font-medium border-b pb-2">
                <div>Grade</div>
                <div>Min Score</div>
                <div>Max Score</div>
                <div>Range</div>
              </div>

              {formData.map((gradeRange, index) => (
                <div key={gradeRange.grade} className="grid grid-cols-4 gap-4 items-center">
                  <div className="font-medium">{gradeRange.grade}</div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={gradeRange.min ?? ""}
                    onChange={(e) => handleChange(index, "min", e.target.value)}
                    placeholder="0"
                    className="h-9"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={gradeRange.max ?? ""}
                    onChange={(e) => handleChange(index, "max", e.target.value)}
                    placeholder="100"
                    className="h-9"
                  />
                  <div className="text-sm text-muted-foreground">
                    {gradeRange.min !== null && gradeRange.max !== null
                      ? `${gradeRange.min}-${gradeRange.max}`
                      : "-"}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              <p>• All scores must be between 0 and 100</p>
              <p>• Min must be less than or equal to Max</p>
              <p>• Ranges must not overlap</p>
              <p>• Ranges must cover 0-100 without gaps when all are set</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || loadingData}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
