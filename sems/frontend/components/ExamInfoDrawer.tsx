"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { updateExam } from "@/lib/api";
import type { Exam, ExamType, ExamSeries } from "@/types/document";
import { ClipboardList, Edit, Calendar, X, Check } from "lucide-react";
import { toast } from "sonner";

interface ExamInfoDrawerProps {
  exam: Exam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ExamInfoDrawer({
  exam,
  open,
  onOpenChange,
  onSuccess,
}: ExamInfoDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    exam_type: "Certificate II Examinations" as ExamType,
    description: "",
    year: new Date().getFullYear(),
    series: "MAY/JUNE" as ExamSeries,
    number_of_series: 1,
  });

  useEffect(() => {
    if (exam) {
      setFormData({
        exam_type: exam.exam_type as ExamType,
        description: exam.description || "",
        year: exam.year,
        series: exam.series as ExamSeries,
        number_of_series: exam.number_of_series,
      });
      setIsEditing(false);
    }
  }, [exam, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam) return;

    setLoading(true);
    try {
      // Validate year range
      if (formData.year < 1900 || formData.year > 2100) {
        toast.error("Year must be between 1900 and 2100");
        setLoading(false);
        return;
      }

      // Validate number_of_series
      if (formData.number_of_series < 1 || formData.number_of_series > 10) {
        toast.error("Number of series must be between 1 and 10");
        setLoading(false);
        return;
      }

      await updateExam(exam.id, {
        exam_type: formData.exam_type,
        description: formData.description || null,
        year: formData.year,
        series: formData.series,
        number_of_series: formData.number_of_series,
      });
      toast.success("Examination updated successfully");
      setIsEditing(false);
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update examination";
      toast.error(errorMessage);
      if (process.env.NODE_ENV === "development") {
        console.error("Error updating examination:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "year" || name === "number_of_series" ? parseInt(value) || 0 : value,
    }));
  };

  const handleNameChange = (value: ExamType) => {
    setFormData((prev) => ({ ...prev, exam_type: value }));
  };

  const handleSeriesChange = (value: ExamSeries) => {
    setFormData((prev) => ({ ...prev, series: value }));
  };

  const handleCancel = () => {
    if (exam) {
      setFormData({
        exam_type: exam.exam_type as ExamType,
        description: exam.description || "",
        year: exam.year,
        series: exam.series as ExamSeries,
        number_of_series: exam.number_of_series,
      });
    }
    setIsEditing(false);
  };

  if (!exam) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Examination Information
          </SheetTitle>
          <SheetDescription>
            {isEditing ? "Edit examination details" : "View examination details"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Basic Information</CardTitle>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      disabled={loading}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={loading}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      {loading ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="exam_type">
                      Examination Name <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.exam_type}
                      onValueChange={handleNameChange}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select examination name" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Certificate II Examinations">
                          Certificate II Examinations
                        </SelectItem>
                        <SelectItem value="Advance">Advance</SelectItem>
                        <SelectItem value="Technician Part I">Technician Part I</SelectItem>
                        <SelectItem value="Technician Part II">Technician Part II</SelectItem>
                        <SelectItem value="Technician Part III">Technician Part III</SelectItem>
                        <SelectItem value="Diploma">Diploma</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="year">
                      Year <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="year"
                      name="year"
                      type="number"
                      value={formData.year}
                      onChange={handleChange}
                      required
                      min={1900}
                      max={2100}
                      placeholder="Enter year (1900-2100)"
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="series">
                      Series <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.series}
                      onValueChange={handleSeriesChange}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select series" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAY/JUNE">MAY/JUNE</SelectItem>
                        <SelectItem value="NOV/DEC">NOV/DEC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="number_of_series">
                      Number of Series <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="number_of_series"
                      name="number_of_series"
                      type="number"
                      value={formData.number_of_series}
                      onChange={handleChange}
                      required
                      min={1}
                      max={10}
                      placeholder="Enter number of series (1-10)"
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of groups (1-10)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Enter description (optional)"
                      disabled={loading}
                      rows={3}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground min-w-[120px]">Exam Type:</span>
                      <span className="text-sm font-medium">{exam.exam_type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground min-w-[120px]">Year:</span>
                      <span className="text-sm font-medium">{exam.year}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground min-w-[120px]">Series:</span>
                      <span className="text-sm font-medium">{exam.series}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground min-w-[120px]">Number of Series:</span>
                      <span className="text-sm font-medium">{exam.number_of_series}</span>
                    </div>
                    {exam.description && (
                      <div className="flex items-start gap-2">
                        <span className="text-sm text-muted-foreground min-w-[120px]">Description:</span>
                        <span className="text-sm font-medium flex-1">{exam.description}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground min-w-[120px]">Created:</span>
                      <span className="text-sm font-medium">
                        {new Date(exam.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
