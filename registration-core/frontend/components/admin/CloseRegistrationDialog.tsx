"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, XCircle } from "lucide-react";
import type { RegistrationExam } from "@/types";

interface CloseRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam | null;
  onConfirm: () => void;
  loading?: boolean;
}

export function CloseRegistrationDialog({
  open,
  onOpenChange,
  exam,
  onConfirm,
  loading = false,
}: CloseRegistrationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Close Registration Period
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will close the registration period for this examination.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {exam && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              You are about to close registration for:
            </div>
            <div className="rounded-md border p-4 bg-muted">
              <div className="text-sm font-medium">{exam.exam_type}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {exam.exam_series} {exam.year}
              </div>
              {exam.description && (
                <div className="text-sm text-muted-foreground mt-1">
                  {exam.description}
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> Once closed, candidates will no longer be able to register for this examination.
                The registration end date will be set to the current time and the period will be marked as inactive.
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Are you sure you want to proceed?
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Closing..." : "Close Registration"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
