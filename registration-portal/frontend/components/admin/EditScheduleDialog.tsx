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
  const [paper1, setPaper1] = useState(true);
  const [paper2, setPaper2] = useState(false);
  const [paper1Date, setPaper1Date] = useState("");
  const [paper1StartTime, setPaper1StartTime] = useState("");
  const [paper1EndTime, setPaper1EndTime] = useState("");
  const [paper2Date, setPaper2Date] = useState("");
  const [paper2StartTime, setPaper2StartTime] = useState("");
  const [paper2EndTime, setPaper2EndTime] = useState("");
  const [writeTogether, setWriteTogether] = useState(false);
  const [venue, setVenue] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && schedule) {
      setSubjectCode(schedule.subject_code);
      setSubjectName(schedule.subject_name);

      // Extract paper data from papers array
      const paper1Data = schedule.papers.find((p) => p.paper === 1);
      const paper2Data = schedule.papers.find((p) => p.paper === 2);

      setPaper1(!!paper1Data);
      setPaper2(!!paper2Data);

      if (paper1Data) {
        setPaper1Date(paper1Data.date || "");
        setPaper1StartTime(paper1Data.start_time ? paper1Data.start_time.split(":").slice(0, 2).join(":") : "");
        setPaper1EndTime(paper1Data.end_time ? paper1Data.end_time.split(":").slice(0, 2).join(":") : "");
      } else {
        setPaper1Date("");
        setPaper1StartTime("");
        setPaper1EndTime("");
      }

      if (paper2Data) {
        setPaper2Date(paper2Data.date || "");
        setPaper2StartTime(paper2Data.start_time ? paper2Data.start_time.split(":").slice(0, 2).join(":") : "");
        setPaper2EndTime(paper2Data.end_time ? paper2Data.end_time.split(":").slice(0, 2).join(":") : "");
      } else {
        setPaper2Date("");
        setPaper2StartTime("");
        setPaper2EndTime("");
      }

      // Check if papers are written together (same date and time)
      if (paper1Data && paper2Data && paper1Data.date === paper2Data.date && paper1Data.start_time === paper2Data.start_time) {
        setWriteTogether(true);
      } else {
        setWriteTogether(false);
      }

      setVenue(schedule.venue || "");
      setDurationMinutes(schedule.duration_minutes?.toString() || "");
      setInstructions(schedule.instructions || "");
    }
  }, [open, schedule]);

  // Handle write together checkbox - copy paper1 date/time to paper2
  useEffect(() => {
    if (writeTogether && paper2) {
      setPaper2Date(paper1Date);
      setPaper2StartTime(paper1StartTime);
      setPaper2EndTime(paper1EndTime);
    }
  }, [writeTogether, paper1Date, paper1StartTime, paper1EndTime, paper2]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paper1 && !paper2) {
      toast.error("At least one paper must be selected");
      return;
    }

    // Validate paper 1
    if (paper1 && (!paper1Date || !paper1StartTime)) {
      toast.error("Paper 1 date and start time are required");
      return;
    }

    // Validate paper 2
    if (paper2 && (!paper2Date || !paper2StartTime)) {
      toast.error("Paper 2 date and start time are required");
      return;
    }

    setLoading(true);

    try {
      // Build papers array with dates
      const papers: Array<{ paper: number; date: string; start_time: string; end_time?: string }> = [];
      if (paper1) {
        const paper1Entry: { paper: number; date: string; start_time: string; end_time?: string } = {
          paper: 1,
          date: paper1Date,
          start_time: paper1StartTime,
        };
        if (paper1EndTime) {
          paper1Entry.end_time = paper1EndTime;
        }
        papers.push(paper1Entry);
      }
      if (paper2) {
        const paper2Entry: { paper: number; date: string; start_time: string; end_time?: string } = {
          paper: 2,
          date: paper2Date,
          start_time: paper2StartTime,
        };
        if (paper2EndTime) {
          paper2Entry.end_time = paper2EndTime;
        }
        papers.push(paper2Entry);
      }

      const scheduleData: ExaminationScheduleUpdate = {
        subject_code: subjectCode.trim(),
        subject_name: subjectName.trim(),
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
              {paper1 && paper2 && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox
                    id="writeTogether"
                    checked={writeTogether}
                    onCheckedChange={(checked) => setWriteTogether(checked as boolean)}
                    disabled={loading}
                  />
                  <Label htmlFor="writeTogether" className="cursor-pointer text-sm">Write together (copy Paper 1 date/time to Paper 2)</Label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Select at least one paper. Each paper requires a date and start time.</p>
            </div>
            {paper1 && (
              <div className="space-y-3 p-4 border rounded-md">
                <Label className="text-base font-semibold">Paper 1 *</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paper1Date">Date *</Label>
                    <Input
                      id="paper1Date"
                      type="date"
                      value={paper1Date}
                      onChange={(e) => setPaper1Date(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paper1StartTime">Start Time *</Label>
                    <Input
                      id="paper1StartTime"
                      type="time"
                      value={paper1StartTime}
                      onChange={(e) => setPaper1StartTime(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paper1EndTime">End Time (Optional)</Label>
                  <Input
                    id="paper1EndTime"
                    type="time"
                    value={paper1EndTime}
                    onChange={(e) => setPaper1EndTime(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            )}
            {paper2 && (
              <div className="space-y-3 p-4 border rounded-md">
                <Label className="text-base font-semibold">Paper 2 *</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paper2Date">Date *</Label>
                    <Input
                      id="paper2Date"
                      type="date"
                      value={paper2Date}
                      onChange={(e) => {
                        setPaper2Date(e.target.value);
                        if (writeTogether) {
                          setWriteTogether(false);
                        }
                      }}
                      required
                      disabled={loading || writeTogether}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paper2StartTime">Start Time *</Label>
                    <Input
                      id="paper2StartTime"
                      type="time"
                      value={paper2StartTime}
                      onChange={(e) => {
                        setPaper2StartTime(e.target.value);
                        if (writeTogether) {
                          setWriteTogether(false);
                        }
                      }}
                      required
                      disabled={loading || writeTogether}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paper2EndTime">End Time (Optional)</Label>
                  <Input
                    id="paper2EndTime"
                    type="time"
                    value={paper2EndTime}
                    onChange={(e) => {
                      setPaper2EndTime(e.target.value);
                      if (writeTogether) {
                        setWriteTogether(false);
                      }
                    }}
                    disabled={loading || writeTogether}
                  />
                </div>
              </div>
            )}
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
