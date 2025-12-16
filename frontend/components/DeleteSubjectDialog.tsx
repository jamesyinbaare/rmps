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
import { Badge } from "@/components/ui/badge";
import { deleteSubject } from "@/lib/api";
import type { Subject } from "@/types/document";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteSubjectDialogProps {
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteSubjectDialog({
  subject,
  open,
  onOpenChange,
  onSuccess,
}: DeleteSubjectDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!subject) return;

    setLoading(true);
    try {
      await deleteSubject(subject.id);
      toast.success("Subject deleted successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete subject"
      );
      console.error("Error deleting subject:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!subject) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Delete Subject</DialogTitle>
              <DialogDescription className="mt-1">
                Are you sure you want to delete this subject? This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{subject.name}</p>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-muted-foreground">
                Code: <span className="font-mono">{subject.code}</span>
              </p>
              <Badge variant={subject.subject_type === "CORE" ? "default" : "secondary"}>
                {subject.subject_type === "CORE" ? "Core" : "Elective"}
              </Badge>
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
              "Delete Subject"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
