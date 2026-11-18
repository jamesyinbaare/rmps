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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSubject } from "@/lib/api";
import { toast } from "sonner";

interface CreateSubjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateSubjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateSubjectDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [subjectType, setSubjectType] = useState<"CORE" | "ELECTIVE">("CORE");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error("Subject code is required");
      return;
    }

    if (!name.trim()) {
      toast.error("Subject name is required");
      return;
    }

    setLoading(true);

    try {
      await createSubject({
        code: code.trim(),
        name: name.trim(),
        subject_type: subjectType,
      });
      toast.success("Subject created successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setCode("");
      setName("");
      setSubjectType("CORE");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create subject");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Subject</DialogTitle>
          <DialogDescription>Add a new subject to the system.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Subject Code</Label>
              <Input
                id="code"
                placeholder="301"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Subject Name</Label>
              <Input
                id="name"
                placeholder="Subject Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject_type">Subject Type</Label>
              <Select
                value={subjectType}
                onValueChange={(value) => setSubjectType(value as "CORE" | "ELECTIVE")}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORE">CORE</SelectItem>
                  <SelectItem value="ELECTIVE">ELECTIVE</SelectItem>
                </SelectContent>
              </Select>
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
