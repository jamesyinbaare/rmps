"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateExam } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";

interface EditExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam;
  onSuccess: () => void;
}

export function EditExamDialog({
  open,
  onOpenChange,
  exam,
  onSuccess,
}: EditExamDialogProps) {
  const [examType, setExamType] = useState("");
  const [examSeries, setExamSeries] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && exam) {
      setExamType(exam.exam_type);
      setExamSeries(exam.exam_series || "");
      setYear(exam.year.toString());
    }
  }, [open, exam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!examType || !year) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate exam_series is required for Certificate II Examinations
    if (examType === "Certificate II Examinations" && !examSeries) {
      toast.error("Exam Series is required for Certificate II Examinations");
      return;
    }

    // Validate year
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      toast.error("Year must be a valid number between 1900 and 2100");
      return;
    }

    setLoading(true);

    try {
      await updateExam(exam.id, {
        exam_type: examType,
        exam_series: examType === "Certificate II Examinations" ? examSeries : null,
        year: yearNum,
      });

      toast.success("Examination updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update examination");
    } finally {
      setLoading(false);
    }
  };

  const isCertificateII = examType === "Certificate II Examinations";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Examination Details</DialogTitle>
          <DialogDescription>
            Update the examination type, year, and series. This can only be done if no candidates have registered for this examination.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className={`grid gap-4 ${isCertificateII ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-2">
                <Label htmlFor="examType">Exam Type *</Label>
                <Select
                  value={examType}
                  onValueChange={(value) => {
                    setExamType(value);
                    // Clear exam_series when changing away from Certificate II Examinations
                    if (value !== "Certificate II Examinations") {
                      setExamSeries("");
                    }
                  }}
                  disabled={loading}
                  required
                >
                  <SelectTrigger id="examType">
                    <SelectValue placeholder="Select exam type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Certificate II Examinations">Certificate II Examinations</SelectItem>
                    <SelectItem value="Advance">Advance</SelectItem>
                    <SelectItem value="Technician Part I">Technician Part I</SelectItem>
                    <SelectItem value="Technician Part II">Technician Part II</SelectItem>
                    <SelectItem value="Technician Part III">Technician Part III</SelectItem>
                    <SelectItem value="Diploma">Diploma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isCertificateII && (
                <div className="space-y-2">
                  <Label htmlFor="examSeries">Exam Series *</Label>
                  <Select
                    value={examSeries}
                    onValueChange={setExamSeries}
                    disabled={loading}
                    required
                  >
                    <SelectTrigger id="examSeries">
                      <SelectValue placeholder="Select series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MAY/JUNE">MAY/JUNE</SelectItem>
                      <SelectItem value="NOV/DEC">NOV/DEC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                min="1900"
                max="2100"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
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
