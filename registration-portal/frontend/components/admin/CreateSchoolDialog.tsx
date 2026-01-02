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
import { createSchool } from "@/lib/api";
import { toast } from "sonner";

interface CreateSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateSchoolDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateSchoolDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error("School code is required");
      return;
    }

    if (!name.trim()) {
      toast.error("School name is required");
      return;
    }

    if (code.length > 6) {
      toast.error("School code must be 6 characters or less");
      return;
    }

    if (name.length > 255) {
      toast.error("School name must be 255 characters or less");
      return;
    }

    setLoading(true);

    try {
      await createSchool({
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });
      toast.success("School created successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setCode("");
      setName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create school");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create School</DialogTitle>
          <DialogDescription>Add a new school to the system.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">School Code</Label>
              <Input
                id="code"
                placeholder="SCH001"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                disabled={loading}
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground">Maximum 6 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">School Name</Label>
              <Input
                id="name"
                placeholder="School Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">Maximum 255 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
