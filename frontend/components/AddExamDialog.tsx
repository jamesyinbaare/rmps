"use client";

import { useState } from "react";
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
import { createExam } from "@/lib/api";
import { toast } from "sonner";
import type { ExamName, ExamSeries } from "@/types/document";

interface AddExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddExamDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddExamDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "Certificate II Examination" as ExamName,
    description: "",
    year: new Date().getFullYear(),
    series: "MAY/JUNE" as ExamSeries,
    number_of_series: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      await createExam({
        name: formData.name,
        description: formData.description || null,
        year: formData.year,
        series: formData.series,
        number_of_series: formData.number_of_series,
      });
      toast.success("Examination created successfully");
      setFormData({
        name: "Certificate II Examination",
        description: "",
        year: new Date().getFullYear(),
        series: "MAY/JUNE",
        number_of_series: 1,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create examination";
      toast.error(errorMessage);
      // Only log to console in development for debugging
      if (process.env.NODE_ENV === "development") {
        console.error("Error creating examination:", error);
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

  const handleNameChange = (value: ExamName) => {
    setFormData((prev) => ({ ...prev, name: value }));
  };

  const handleSeriesChange = (value: ExamSeries) => {
    setFormData((prev) => ({ ...prev, series: value }));
  };

  const handleCancel = () => {
    setFormData({
      name: "Certificate II Examination",
      description: "",
      year: new Date().getFullYear(),
      series: "MAY/JUNE",
      number_of_series: 1,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Examination</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new examination. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Examination Name <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.name}
                onValueChange={handleNameChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select examination name" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Certificate II Examination">
                    Certificate II Examination
                  </SelectItem>
                  <SelectItem value="CBT">CBT</SelectItem>
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
              {loading ? "Creating..." : "Create Examination"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
