"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [isPrivateExaminationCenter, setIsPrivateExaminationCenter] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (school) {
      setName(school.name);
      setIsActive(school.is_active);
      setIsPrivateExaminationCenter(school.is_private_examination_center ?? false);
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
        is_private_examination_center: isPrivateExaminationCenter,
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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="isActive" className="font-normal cursor-pointer">
                  Active
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Inactive schools cannot register candidates
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPrivateExaminationCenter"
                  checked={isPrivateExaminationCenter}
                  onCheckedChange={(checked) => setIsPrivateExaminationCenter(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="isPrivateExaminationCenter" className="font-normal cursor-pointer">
                  Private Examination Center
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow this school to serve as an examination center for private candidates
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
