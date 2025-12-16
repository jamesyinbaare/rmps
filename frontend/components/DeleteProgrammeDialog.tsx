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
import { deleteProgramme } from "@/lib/api";
import type { Programme } from "@/types/document";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteProgrammeDialogProps {
  programme: Programme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteProgrammeDialog({
  programme,
  open,
  onOpenChange,
  onSuccess,
}: DeleteProgrammeDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!programme) return;

    setLoading(true);
    try {
      await deleteProgramme(programme.id);
      toast.success("Programme deleted successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete programme"
      );
      console.error("Error deleting programme:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!programme) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Delete Programme</DialogTitle>
              <DialogDescription className="mt-1">
                Are you sure you want to delete this programme? This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{programme.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Code: {programme.code}
            </p>
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
              "Delete Programme"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
