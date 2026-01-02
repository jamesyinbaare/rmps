"use client";

import { useState, useEffect } from "react";
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
import { updateSchool } from "@/lib/api";
import { toast } from "sonner";
import type { SchoolDetail } from "@/types";

interface EditSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolDetail | null;
  onSuccess: () => void;
}

export function EditSchoolDialog({
  open,
  onOpenChange,
  school,
  onSuccess,
}: EditSchoolDialogProps) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (school) {
      setName(school.name);
      setIsActive(school.is_active);
    }
  }, [school, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!school) return;

    setLoading(true);

    try {
      await updateSchool(school.id, {
        name,
        is_active: isActive,
      });
      toast.success("School updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update school");
    } finally {
      setLoading(false);
    }
  };

  if (!school) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit School</DialogTitle>
          <DialogDescription>Update school information.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">School Code</Label>
              <Input id="code" value={school.code} disabled />
              <p className="text-xs text-muted-foreground">School code cannot be changed</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">School Name</Label>
              <Input
                id="name"
                placeholder="School name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive" className="flex items-center gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={loading}
                  className="rounded border-gray-300"
                />
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Inactive schools cannot register candidates
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
