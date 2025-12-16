"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSubject } from "@/lib/api";
import type { Subject } from "@/types/document";
import { toast } from "sonner";

interface EditSubjectModalProps {
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditSubjectModal({
  subject,
  open,
  onOpenChange,
  onSuccess,
}: EditSubjectModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    subject_type: "CORE" as "CORE" | "ELECTIVE",
  });

  useEffect(() => {
    if (subject) {
      setFormData({
        name: subject.name,
        subject_type: subject.subject_type,
      });
    }
  }, [subject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject) return;

    setLoading(true);
    try {
      await updateSubject(subject.id, formData);
      toast.success("Subject updated successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update subject"
      );
      console.error("Error updating subject:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubjectTypeChange = (value: "CORE" | "ELECTIVE") => {
    setFormData((prev) => ({ ...prev, subject_type: value }));
  };

  const handleCancel = () => {
    if (subject) {
      setFormData({
        name: subject.name,
        subject_type: subject.subject_type,
      });
    }
    onOpenChange(false);
  };

  if (!subject) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Subject</DialogTitle>
          <DialogDescription>
            Update the subject details. The code cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Subject Code
              </label>
              <Input
                id="code"
                type="text"
                value={subject.code}
                disabled
                className="font-mono bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Subject code cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Subject Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={255}
                placeholder="Enter subject name"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="subject_type" className="text-sm font-medium">
                Subject Type <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.subject_type}
                onValueChange={handleSubjectTypeChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subject type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORE">Core</SelectItem>
                  <SelectItem value="ELECTIVE">Elective</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
