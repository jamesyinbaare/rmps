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
import { Input } from "@/components/ui/input";
import { createProgramme } from "@/lib/api";
import { toast } from "sonner";

interface AddProgrammeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddProgrammeDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddProgrammeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createProgramme(formData);
      toast.success("Programme created successfully");
      setFormData({ code: "", name: "" });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create programme"
      );
      console.error("Error creating programme:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    setFormData({ code: "", name: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Programme</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new programme. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Programme Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="code"
                name="code"
                type="text"
                value={formData.code}
                onChange={handleChange}
                required
                maxLength={50}
                placeholder="Enter programme code"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Programme Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={255}
                placeholder="Enter programme name"
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Programme"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
