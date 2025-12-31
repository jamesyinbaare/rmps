"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updateUser } from "@/lib/api";
import { toast } from "sonner";
import type { User, UserRole, UserUpdate } from "@/types/document";
import { getAvailableRoles } from "@/lib/role-utils";

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  REGISTRAR: "Registrar",
  OFFICER: "Officer",
  DATACLERK: "Data Clerk",
};

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSuccess?: () => void;
  currentUserRole?: UserRole;
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
  currentUserRole,
}: EditUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<UserUpdate>({
    full_name: "",
    role: undefined,
    is_active: undefined,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const updateData: UserUpdate = {};
      if (formData.full_name !== user.full_name) {
        updateData.full_name = formData.full_name;
      }
      if (formData.role !== user.role) {
        updateData.role = formData.role;
      }
      if (formData.is_active !== user.is_active) {
        updateData.is_active = formData.is_active;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info("No changes to save");
        setLoading(false);
        return;
      }

      await updateUser(user.id, updateData);
      toast.success("User updated successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
      console.error("Error updating user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
      });
    }
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information. Email cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="full_name" className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="full_name"
                type="text"
                value={formData.full_name || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, full_name: e.target.value }))
                }
                required
                maxLength={255}
                placeholder="Enter full name"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, role: value as UserRole }))
                }
                disabled={loading}
                required
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableRoles(currentUserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active ?? false}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked as boolean }))
                }
                disabled={loading}
              />
              <Label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
                Active
              </Label>
              <p className="text-xs text-muted-foreground ml-2">
                Inactive users cannot log in
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
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
