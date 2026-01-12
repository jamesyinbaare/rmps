"use client";

import { useState } from "react";
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
import { DatePicker } from "@/components/ui/date-picker";
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
  const [registrationStartDate, setRegistrationStartDate] = useState<Date | null>(null);
  const [registrationEndDate, setRegistrationEndDate] = useState<Date | null>(null);
  const [allowsBulkRegistration, setAllowsBulkRegistration] = useState(true);
  const [allowsPrivateRegistration, setAllowsPrivateRegistration] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!examType || !year || !registrationStartDate || !registrationEndDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate exam_series is required for Certificate II Examinations
    if (examType === "Certificate II Examinations" && !examSeries) {
      toast.error("Exam Series is required for Certificate II Examinations");
      return;
    }

    // Set dates to start of day for comparison
    const startDate = new Date(registrationStartDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(registrationEndDate);
    endDate.setHours(23, 59, 59, 999); // End of day

    if (endDate <= startDate) {
      toast.error("Registration end date must be after start date");
      return;
    }

    setLoading(true);

    try {
      // Set start date to beginning of day and end date to end of day
      const startDateTime = new Date(registrationStartDate);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(registrationEndDate);
      endDateTime.setHours(23, 59, 59, 999);

      const examData: RegistrationExamCreate = {
        exam_type: examType,
        exam_series: examType === "Certificate II Examinations" ? examSeries : null,
        year: parseInt(year),
        description: description || null,
        registration_period: {
          registration_start_date: startDateTime.toISOString(),
          registration_end_date: endDateTime.toISOString(),
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
      setRegistrationStartDate(null);
      setRegistrationEndDate(null);
      setAllowsBulkRegistration(true);
      setAllowsPrivateRegistration(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create exam");
    } finally {
      setLoading(false);
    }
  };

  const isCertificateII = examType === "Certificate II Examinations";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Examination</DialogTitle>
          <DialogDescription>Set up a new examination with registration period.</DialogDescription>
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
                      <SelectValue placeholder="Select exam series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MAY/JUNE">May/June</SelectItem>
                      <SelectItem value="NOV/DEC">Nov/Dec</SelectItem>
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
              <DatePicker
                label="Registration Start Date *"
                value={registrationStartDate}
                onChange={setRegistrationStartDate}
                placeholder="Select start date"
                disabled={loading}
              />
              <DatePicker
                label="Registration End Date *"
                value={registrationEndDate}
                onChange={setRegistrationEndDate}
                placeholder="Select end date"
                disabled={loading}
              />
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
