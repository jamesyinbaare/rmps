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
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!subject) return;

    setLoading(true);
    setError(null);
    try {
      await deleteSubject(subject.id);
      toast.success("Subject deleted successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete subject. Please try again.";
      setError(errorMessage);
      toast.error(errorMessage);
      console.error("Error deleting subject:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDialogChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  if (!subject) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
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

        <div className="py-4 space-y-4">
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

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogChange(false)}
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
