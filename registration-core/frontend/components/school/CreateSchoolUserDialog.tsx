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
import { createSchoolUser } from "@/lib/api";
import { toast } from "sonner";

interface CreateSchoolUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isAtLimit: boolean;
}

export function CreateSchoolUserDialog({
  open,
  onOpenChange,
  onSuccess,
  isAtLimit,
}: CreateSchoolUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAtLimit) {
      toast.error(
        "Cannot create user: You have reached the maximum of 10 active users. Please deactivate an existing user first."
      );
      return;
    }

    setLoading(true);

    try {
      const user = await createSchoolUser({
        email,
        full_name: fullName,
      });
      if (user.invite_sent === false) {
        toast.warning(
          "User created, but the invite email failed to send. Use Resend invite."
        );
      } else {
        toast.success("User created. An invite email was sent to set their password.");
      }
      onSuccess();
      onOpenChange(false);
      setEmail("");
      setFullName("");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create user";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create School User</DialogTitle>
          <DialogDescription>
            Create a school staff account. They will receive an email to set their own password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@school.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || isAtLimit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading || isAtLimit}
              />
            </div>
            {isAtLimit && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                You have reached the maximum of 10 active users. Please deactivate an existing user
                first.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || isAtLimit}>
              {loading ? "Creating..." : "Create & send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
