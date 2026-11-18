"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Key, AlertTriangle } from "lucide-react";
import type { RegistrationExam } from "@/types";

interface GenerateIndexNumbersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam | null;
  onConfirm: (replaceExisting: boolean) => void;
  loading?: boolean;
}

export function GenerateIndexNumbersDialog({
  open,
  onOpenChange,
  exam,
  onConfirm,
  loading = false,
}: GenerateIndexNumbersDialogProps) {
  const [replaceExisting, setReplaceExisting] = useState(false);

  const handleConfirm = () => {
    onConfirm(replaceExisting);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when dialog closes
      setReplaceExisting(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600" />
            Generate Index Numbers
          </AlertDialogTitle>
          <AlertDialogDescription>
            Generate unique index numbers for all registered candidates.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {exam && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              Exam:
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

            <div className="space-y-3">
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                <Checkbox
                  id="replace-existing"
                  checked={replaceExisting}
                  onCheckedChange={(checked) => setReplaceExisting(checked === true)}
                  disabled={loading}
                />
                <div className="space-y-1 leading-none">
                  <Label
                    htmlFor="replace-existing"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Replace existing index numbers
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {replaceExisting
                      ? "All candidates will get new index numbers, replacing any existing ones."
                      : "Only candidates without index numbers will be processed. Existing index numbers will remain unchanged."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                This process runs in the background and may take several minutes depending on the number of candidates.
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Do you want to proceed?
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : "Generate Index Numbers"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
