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

  // Expand schedules into paper entries
  interface PaperEntry {
    schedule: ExaminationSchedule;
    paper: number;
    date: string;
    startTime: string;
    endTime?: string;
  }

  const paperEntries: PaperEntry[] = [];
  for (const schedule of schedules) {
    for (const paperInfo of schedule.papers) {
      if (paperInfo.date && paperInfo.start_time) {
        paperEntries.push({
          schedule,
          paper: paperInfo.paper,
          date: paperInfo.date,
          startTime: paperInfo.start_time,
          endTime: paperInfo.end_time,
        });
      }
    }
  }

  // Sort paper entries by date and time
  const sortedPaperEntries = [...paperEntries].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.startTime.localeCompare(b.startTime);
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
            ) : sortedPaperEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No schedules found
                </TableCell>
              </TableRow>
            ) : (
              sortedPaperEntries.map((entry, index) => (
                <TableRow key={`${entry.schedule.id}-${entry.paper}-${index}`}>
                  <TableCell className="font-medium">{formatDate(entry.date)}</TableCell>
                  <TableCell className="font-mono">{entry.schedule.subject_code}</TableCell>
                  <TableCell>{entry.schedule.subject_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">Paper {entry.paper}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatTime(entry.startTime)}
                    {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                  </TableCell>
                  <TableCell>{entry.schedule.venue || "TBA"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(entry.schedule)}
                        disabled={loading}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(entry.schedule)}
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
