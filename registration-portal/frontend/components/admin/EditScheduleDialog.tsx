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
import { updateExaminationSchedule } from "@/lib/api";
import { toast } from "sonner";
import type { ExaminationSchedule, ExaminationScheduleUpdate } from "@/types";

interface EditScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  schedule: ExaminationSchedule;
  onSuccess: () => void;
}

export function EditScheduleDialog({
  open,
  onOpenChange,
  examId,
  schedule,
  onSuccess,
}: EditScheduleDialogProps) {
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [examinationDate, setExaminationDate] = useState("");
  const [examinationTime, setExaminationTime] = useState("");
  const [examinationEndTime, setExaminationEndTime] = useState("");
  const [paper1, setPaper1] = useState(true);
  const [paper2, setPaper2] = useState(false);
  const [venue, setVenue] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && schedule) {
      setSubjectCode(schedule.subject_code);
      setSubjectName(schedule.subject_name);
      // Format date for input (YYYY-MM-DD)
      const date = new Date(schedule.examination_date);
      setExaminationDate(date.toISOString().split("T")[0]);
      // Format time for input (HH:MM)
      const time = schedule.examination_time.split(":").slice(0, 2).join(":");
      setExaminationTime(time);
      if (schedule.examination_end_time) {
        const endTime = schedule.examination_end_time.split(":").slice(0, 2).join(":");
        setExaminationEndTime(endTime);
      } else {
        setExaminationEndTime("");
      }
      // Set papers
      const hasPaper1 = schedule.papers.some((p) => p.paper === 1);
      const hasPaper2 = schedule.papers.some((p) => p.paper === 2);
      setPaper1(hasPaper1);
      setPaper2(hasPaper2);
      setVenue(schedule.venue || "");
      setDurationMinutes(schedule.duration_minutes?.toString() || "");
      setInstructions(schedule.instructions || "");
    }
  }, [open, schedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

      const scheduleData: ExaminationScheduleUpdate = {
        subject_code: subjectCode.trim(),
        subject_name: subjectName.trim(),
        examination_date: examinationDate,
        examination_time: examinationTime,
        examination_end_time: examinationEndTime || null,
        papers,
        venue: venue.trim() || null,
        duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
        instructions: instructions.trim() || null,
      };

      await updateExaminationSchedule(examId, schedule.id, scheduleData);
      toast.success("Schedule updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Examination Schedule</DialogTitle>
          <DialogDescription>Update schedule entry details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subjectCode">Subject Code *</Label>
                <Input
                  id="subjectCode"
                  placeholder="301"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                  required
                  disabled={loading}
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subjectName">Subject Name *</Label>
                <Input
                  id="subjectName"
                  placeholder="Mathematics"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
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
              {loading ? "Updating..." : "Update Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
