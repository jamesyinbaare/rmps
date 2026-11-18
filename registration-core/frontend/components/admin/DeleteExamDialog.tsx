"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import type { RegistrationExam } from "@/types";

interface DeleteExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam;
  onConfirm: () => void;
  loading?: boolean;
}

export function DeleteExamDialog({
  open,
  onOpenChange,
  exam,
  onConfirm,
  loading = false,
}: DeleteExamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Examination
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the examination and all associated data.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive mb-2">You are about to delete:</p>
            <div className="text-sm space-y-1">
              <p>
                <span className="font-medium">Exam Type:</span> {exam.exam_type}
              </p>
              {exam.exam_series && (
                <p>
                  <span className="font-medium">Series:</span> {exam.exam_series}
                </p>
              )}
              <p>
                <span className="font-medium">Year:</span> {exam.year}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            This will delete the examination, registration period, and all associated schedules. Only examinations
            that have not started registration and have no registered candidates can be deleted.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete Examination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
