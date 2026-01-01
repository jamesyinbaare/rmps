"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteExam } from "@/lib/api";
import type { Exam } from "@/types/document";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteExamDialogProps {
  exam: Exam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteExamDialog({
  exam,
  open,
  onOpenChange,
  onSuccess,
}: DeleteExamDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!exam) return;

    setLoading(true);
    try {
      await deleteExam(exam.id);
      toast.success("Examination deleted successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete examination"
      );
      console.error("Error deleting examination:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!exam) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Delete Examination</DialogTitle>
              <DialogDescription className="mt-1">
                Are you sure you want to delete this examination? This action cannot be undone.
                {exam.description && (
                  <span className="block mt-1 text-xs text-muted-foreground">
                    Note: If this examination has associated documents, deletion will fail.
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{exam.exam_type}</p>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">
                Year: {exam.year} | Series: {exam.series}
              </p>
              {exam.description && (
                <p className="text-xs text-muted-foreground">
                  {exam.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Examination"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
