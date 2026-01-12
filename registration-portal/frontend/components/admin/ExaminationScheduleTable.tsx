"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2 } from "lucide-react";
import type { ExaminationSchedule } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExaminationScheduleTableProps {
  schedules: ExaminationSchedule[];
  loading: boolean;
  onEdit: (schedule: ExaminationSchedule) => void;
  onDelete: (scheduleId: number) => Promise<void>;
}

export function ExaminationScheduleTable({
  schedules,
  loading,
  onEdit,
  onDelete,
}: ExaminationScheduleTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<ExaminationSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (schedule: ExaminationSchedule) => {
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!scheduleToDelete) return;

    setDeleting(true);
    try {
      await onDelete(scheduleToDelete.id);
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    } catch (error) {
      // Error handling is done in parent
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (timeString: string) => {
    const time = timeString.split(":").slice(0, 2).join(":");
    return time;
  };

  const getPaperDisplay = (papers: Array<{ paper: number }>) => {
    const paperNums = papers.map((p) => p.paper).sort();
    if (paperNums.length === 2) {
      return "Paper 1 & 2";
    }
    return `Paper ${paperNums[0]}`;
  };

  // Sort schedules by date and time
  const sortedSchedules = [...schedules].sort((a, b) => {
    const dateA = new Date(a.examination_date).getTime();
    const dateB = new Date(b.examination_date).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.examination_time.localeCompare(b.examination_time);
  });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Subject Code</TableHead>
              <TableHead>Subject Name</TableHead>
              <TableHead>Papers</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : sortedSchedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No schedules found
                </TableCell>
              </TableRow>
            ) : (
              sortedSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{formatDate(schedule.examination_date)}</TableCell>
                  <TableCell className="font-mono">{schedule.subject_code}</TableCell>
                  <TableCell>{schedule.subject_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getPaperDisplay(schedule.papers)}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatTime(schedule.examination_time)}
                    {schedule.examination_end_time && ` - ${formatTime(schedule.examination_end_time)}`}
                  </TableCell>
                  <TableCell>{schedule.venue || "TBA"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(schedule)}
                        disabled={loading}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(schedule)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the schedule for {scheduleToDelete?.subject_name} ({scheduleToDelete?.subject_code})?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
