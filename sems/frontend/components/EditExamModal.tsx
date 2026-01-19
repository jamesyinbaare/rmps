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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateExam } from "@/lib/api";
import type { Exam, ExamType, ExamSeries } from "@/types/document";
import { toast } from "sonner";

interface EditExamModalProps {
  exam: Exam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditExamModal({
  exam,
  open,
  onOpenChange,
  onSuccess,
}: EditExamModalProps) {
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
    }
  }, [exam]);

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
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update examination";
      toast.error(errorMessage);
      // Only log to console in development for debugging
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
    onOpenChange(false);
  };

  if (!exam) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Examination</DialogTitle>
          <DialogDescription>
            Update the examination details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Examination Name <span className="text-destructive">*</span>
              </label>
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
              <label htmlFor="year" className="text-sm font-medium">
                Year <span className="text-destructive">*</span>
              </label>
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
              <label htmlFor="series" className="text-sm font-medium">
                Series <span className="text-destructive">*</span>
              </label>
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
              <label htmlFor="number_of_series" className="text-sm font-medium">
                Number of Series <span className="text-destructive">*</span>
              </label>
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
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Examination"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
