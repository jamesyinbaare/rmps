"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExamEligibleSchoolsSection } from "@/components/admin/ExamEligibleSchoolsSection";

interface ManageEligibleSchoolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  onSaved?: (count: number) => void;
}

export function ManageEligibleSchoolsDialog({
  open,
  onOpenChange,
  examId,
  onSaved,
}: ManageEligibleSchoolsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <DialogTitle>Eligible schools</DialogTitle>
          <DialogDescription>
            Only selected schools can see this examination and register candidates.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {open ? (
            <ExamEligibleSchoolsSection
              examId={examId}
              onSaved={(count) => {
                onSaved?.(count);
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
