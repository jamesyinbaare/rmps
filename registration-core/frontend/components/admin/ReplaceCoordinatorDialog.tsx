"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { replaceSchoolAdmin } from "@/lib/api";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { User } from "@/types";

interface ReplaceCoordinatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  schoolId: number;
  currentAdmin: User | null;
}

export function ReplaceCoordinatorDialog({
  open,
  onOpenChange,
  onSuccess,
  schoolId,
  currentAdmin,
}: ReplaceCoordinatorDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setConfirmOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    setConfirmOpen(true);
  };

  const handleConfirmReplace = async () => {
    setLoading(true);
    try {
      const created = await replaceSchoolAdmin(schoolId, {
        email,
        full_name: fullName,
      });
      if (created.invite_sent === false) {
        toast.warning(
          "Coordinator replaced, but the invite email failed to send. Use Resend invite from this table."
        );
      } else {
        toast.success(
          "Coordinator replaced — previous coordinator deactivated and invite sent"
        );
      }
      onSuccess();
      setConfirmOpen(false);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to replace coordinator"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && loading) return;
    if (!next) resetForm();
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace coordinator</DialogTitle>
            <DialogDescription>
              Enter the new coordinator details. You will confirm before the current
              coordinator is deactivated.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit}>
            <div className="space-y-4 py-4">
              {currentAdmin && (
                <div className="rounded-md border bg-muted p-4 text-sm">
                  <p className="font-medium">Current coordinator</p>
                  <p className="mt-1 text-muted-foreground">
                    {currentAdmin.full_name} ({currentAdmin.email})
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="replace-email">New coordinator email</Label>
                <Input
                  id="replace-email"
                  type="email"
                  placeholder="admin@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replace-fullName">Full name</Label>
                <Input
                  id="replace-fullName"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!loading) setConfirmOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-destructive" />
              Confirm replace coordinator
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the current coordinator and invite a replacement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            {currentAdmin && (
              <div className="rounded-md border bg-muted p-4">
                <div className="text-sm font-medium">{currentAdmin.full_name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{currentAdmin.email}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Will lose portal access immediately
                </div>
              </div>
            )}
            <div className="rounded-md border p-4">
              <div className="text-sm font-medium">New coordinator</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {fullName} ({email})
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> The current coordinator will be deactivated
                immediately and cannot use the school portal. An invite email will be
                sent to the replacement.
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmReplace();
              }}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Replacing…" : "Deactivate & send invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
