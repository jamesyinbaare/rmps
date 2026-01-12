"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { updateRegistrationPeriod } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";

interface OpenRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam;
  onSuccess: () => void;
}

export function OpenRegistrationDialog({
  open,
  onOpenChange,
  exam,
  onSuccess,
}: OpenRegistrationDialogProps) {
  const [newEndDate, setNewEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && exam) {
      // Set default to current end date or tomorrow if closed
      const currentEndDate = new Date(exam.registration_period.registration_end_date);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // If registration is closed, default to tomorrow, otherwise use current end date
      const defaultDate = currentEndDate > new Date() ? currentEndDate : tomorrow;
      setNewEndDate(defaultDate);
    }
  }, [open, exam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEndDate) {
      toast.error("Please select a new registration end date");
      return;
    }

    const currentStartDate = new Date(exam.registration_period.registration_start_date);
    if (newEndDate <= currentStartDate) {
      toast.error("End date must be after start date");
      return;
    }

    setLoading(true);

    try {
      // Set end date to end of day
      const endDateTime = new Date(newEndDate);
      endDateTime.setHours(23, 59, 59, 999);

      await updateRegistrationPeriod(exam.id, {
        registration_end_date: endDateTime.toISOString(),
        is_active: true,
      });

      toast.success("Registration period opened successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open registration period");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Open Registration Period</DialogTitle>
          <DialogDescription>
            Set a new registration end date to reopen registration for this examination
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Registration End Date *</Label>
              <DateTimePicker
                value={newEndDate}
                onChange={setNewEndDate}
                placeholder="Select end date and time"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Current end date: {new Date(exam.registration_period.registration_end_date).toLocaleString()}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Opening..." : "Open Registration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
