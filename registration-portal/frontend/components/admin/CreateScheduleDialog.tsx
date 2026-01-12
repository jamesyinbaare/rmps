"use client";

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/SearchableSelect";
import { createExaminationSchedule, listAllSubjects } from "@/lib/api";
import { toast } from "sonner";
import type { ExaminationScheduleCreate, Subject } from "@/types";

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  onSuccess: () => void;
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  examId,
  onSuccess,
}: CreateScheduleDialogProps) {
  const [originalCode, setOriginalCode] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [examinationDate, setExaminationDate] = useState("");
  const [examinationTime, setExaminationTime] = useState("");
  const [examinationEndTime, setExaminationEndTime] = useState("");
  const [paper1, setPaper1] = useState(true);
  const [paper2, setPaper2] = useState(false);
  const [venue, setVenue] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  // Load subjects when dialog opens
  useEffect(() => {
    if (open) {
      loadSubjects();
    }
  }, [open]);

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const subjectsData = await listAllSubjects();
      setSubjects(subjectsData);
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!originalCode.trim()) {
      toast.error("Subject original code is required");
      return;
    }

    if (!examinationDate) {
      toast.error("Examination date is required");
      return;
    }

    if (!examinationTime) {
      toast.error("Examination time is required");
      return;
    }

    if (!paper1 && !paper2) {
      toast.error("At least one paper must be selected");
      return;
    }

    setLoading(true);

    try {
      // Build papers array
      const papers: Array<{ paper: number; start_time?: string; end_time?: string }> = [];
      if (paper1) {
        papers.push({ paper: 1 });
      }
      if (paper2) {
        papers.push({ paper: 2 });
      }

      const scheduleData: ExaminationScheduleCreate = {
        original_code: originalCode.trim(),
        examination_date: examinationDate,
        examination_time: examinationTime,
        examination_end_time: examinationEndTime || null,
        papers,
        venue: venue.trim() || null,
        duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
        instructions: instructions.trim() || null,
      };

      await createExaminationSchedule(examId, scheduleData);
      toast.success("Schedule created successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setOriginalCode("");
      setExaminationDate("");
      setExaminationTime("");
      setExaminationEndTime("");
      setPaper1(true);
      setPaper2(false);
      setVenue("");
      setDurationMinutes("");
      setInstructions("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create schedule");
    } finally {
      setLoading(false);
    }
  };

  // Build options for SearchableSelect - only include subjects with original_code
  const subjectOptions = subjects
    .filter((s) => s.original_code)
    .map((s) => ({
      value: s.original_code!,
      label: `${s.original_code} - ${s.name}`,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Examination Schedule</DialogTitle>
          <DialogDescription>Add a new schedule entry for a subject.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="originalCode">Subject *</Label>
              {loadingSubjects ? (
                <div className="text-sm text-muted-foreground">Loading subjects...</div>
              ) : (
                <SearchableSelect
                  options={subjectOptions}
                  value={originalCode}
                  onValueChange={setOriginalCode}
                  placeholder="Select subject..."
                  disabled={loading}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="examinationDate">Examination Date *</Label>
                <Input
                  id="examinationDate"
                  type="date"
                  value={examinationDate}
                  onChange={(e) => setExaminationDate(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="examinationTime">Start Time *</Label>
                <Input
                  id="examinationTime"
                  type="time"
                  value={examinationTime}
                  onChange={(e) => setExaminationTime(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="examinationEndTime">End Time (Optional)</Label>
              <Input
                id="examinationEndTime"
                type="time"
                value={examinationEndTime}
                onChange={(e) => setExaminationEndTime(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Papers *</Label>
              <div className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="paper1"
                    checked={paper1}
                    onCheckedChange={(checked) => setPaper1(checked as boolean)}
                    disabled={loading}
                  />
                  <Label htmlFor="paper1" className="cursor-pointer">Paper 1</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="paper2"
                    checked={paper2}
                    onCheckedChange={(checked) => setPaper2(checked as boolean)}
                    disabled={loading}
                  />
                  <Label htmlFor="paper2" className="cursor-pointer">Paper 2</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Select at least one paper. Both papers can be written together.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue">Venue (Optional)</Label>
                <Input
                  id="venue"
                  placeholder="Hall A"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (Minutes, Optional)</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  placeholder="120"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  disabled={loading}
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions (Optional)</Label>
              <textarea
                id="instructions"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
