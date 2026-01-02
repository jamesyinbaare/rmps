"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createExam } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExamCreate } from "@/types";

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateExamDialog({ open, onOpenChange, onSuccess }: CreateExamDialogProps) {
  const [examType, setExamType] = useState("");
  const [examSeries, setExamSeries] = useState("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [registrationStartDate, setRegistrationStartDate] = useState("");
  const [registrationEndDate, setRegistrationEndDate] = useState("");
  const [allowsBulkRegistration, setAllowsBulkRegistration] = useState(true);
  const [allowsPrivateRegistration, setAllowsPrivateRegistration] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!examType || !examSeries || !year || !registrationStartDate || !registrationEndDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    const startDate = new Date(registrationStartDate);
    const endDate = new Date(registrationEndDate);

    if (endDate <= startDate) {
      toast.error("Registration end date must be after start date");
      return;
    }

    setLoading(true);

    try {
      const examData: RegistrationExamCreate = {
        exam_type: examType,
        exam_series: examSeries,
        year: parseInt(year),
        description: description || null,
        registration_period: {
          registration_start_date: startDate.toISOString(),
          registration_end_date: endDate.toISOString(),
          allows_bulk_registration: allowsBulkRegistration,
          allows_private_registration: allowsPrivateRegistration,
        },
      };

      await createExam(examData);
      toast.success("Exam created successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setExamType("");
      setExamSeries("");
      setYear("");
      setDescription("");
      setRegistrationStartDate("");
      setRegistrationEndDate("");
      setAllowsBulkRegistration(true);
      setAllowsPrivateRegistration(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create exam");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Examination</DialogTitle>
          <DialogDescription>Set up a new examination with registration period.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="examType">Exam Type *</Label>
                <Input
                  id="examType"
                  placeholder="e.g., GCE, WASSCE"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="examSeries">Exam Series *</Label>
                <Input
                  id="examSeries"
                  placeholder="e.g., May/June, Nov/Dec"
                  value={examSeries}
                  onChange={(e) => setExamSeries(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                placeholder="2024"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                disabled={loading}
                min="2000"
                max="2100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Registration Start Date *</Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={registrationStartDate}
                  onChange={(e) => setRegistrationStartDate(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Registration End Date *</Label>
                <Input
                  id="endDate"
                  type="datetime-local"
                  value={registrationEndDate}
                  onChange={(e) => setRegistrationEndDate(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowsBulkRegistration}
                  onChange={(e) => setAllowsBulkRegistration(e.target.checked)}
                  disabled={loading}
                />
                Allow Bulk Registration (School Portal)
              </Label>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowsPrivateRegistration}
                  onChange={(e) => setAllowsPrivateRegistration(e.target.checked)}
                  disabled={loading}
                />
                Allow Private Registration
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Exam"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
