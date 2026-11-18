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
import { Checkbox } from "@/components/ui/checkbox";
import { updateRegistrationPeriod } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";

interface UpdateRegistrationPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam;
  onSuccess: () => void;
}

export function UpdateRegistrationPeriodDialog({
  open,
  onOpenChange,
  exam,
  onSuccess,
}: UpdateRegistrationPeriodDialogProps) {
  const [registrationStartDate, setRegistrationStartDate] = useState<Date | null>(null);
  const [registrationEndDate, setRegistrationEndDate] = useState<Date | null>(null);
  const [allowsBulkRegistration, setAllowsBulkRegistration] = useState(true);
  const [allowsPrivateRegistration, setAllowsPrivateRegistration] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && exam) {
      setRegistrationStartDate(new Date(exam.registration_period.registration_start_date));
      setRegistrationEndDate(new Date(exam.registration_period.registration_end_date));
      setAllowsBulkRegistration(exam.registration_period.allows_bulk_registration);
      setAllowsPrivateRegistration(exam.registration_period.allows_private_registration);
    }
  }, [open, exam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!registrationStartDate || !registrationEndDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    if (registrationEndDate <= registrationStartDate) {
      toast.error("End date must be after start date");
      return;
    }

    setLoading(true);

    try {
      // Set start date to beginning of day and end date to end of day
      const startDateTime = new Date(registrationStartDate);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(registrationEndDate);
      endDateTime.setHours(23, 59, 59, 999);

      await updateRegistrationPeriod(exam.id, {
        registration_start_date: startDateTime.toISOString(),
        registration_end_date: endDateTime.toISOString(),
        allows_bulk_registration: allowsBulkRegistration,
        allows_private_registration: allowsPrivateRegistration,
      });

      toast.success("Registration period updated successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update registration period");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Update Registration Period</DialogTitle>
          <DialogDescription>
            Update the registration period dates and settings for this examination
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DateTimePicker
                label="Registration Start Date"
                value={registrationStartDate}
                onChange={setRegistrationStartDate}
              />
              <DateTimePicker
                label="Registration End Date"
                value={registrationEndDate}
                onChange={setRegistrationEndDate}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allows-bulk"
                  checked={allowsBulkRegistration}
                  onCheckedChange={(checked) => setAllowsBulkRegistration(checked === true)}
                />
                <Label htmlFor="allows-bulk" className="text-sm font-normal cursor-pointer">
                  Allow bulk registration
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allows-private"
                  checked={allowsPrivateRegistration}
                  onCheckedChange={(checked) => setAllowsPrivateRegistration(checked === true)}
                />
                <Label htmlFor="allows-private" className="text-sm font-normal cursor-pointer">
                  Allow private candidate registration
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Period"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
