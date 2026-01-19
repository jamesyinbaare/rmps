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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSubject } from "@/lib/api";
import type { ExamType } from "@/types/document";
import { toast } from "sonner";

interface AddSubjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddSubjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddSubjectDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    original_code: "",
    name: "",
    subject_type: "CORE" as "CORE" | "ELECTIVE",
    exam_type: "Certificate II Examinations" as ExamType,
    programme_type: "cert2" as "cert2" | "nvti" | undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate code length based on programme_type
      const programmeType = formData.programme_type || "cert2";
      if (programmeType === "cert2") {
        if (formData.code.length !== 3) {
          toast.error("Subject code must be exactly 3 characters for CERT2 programme type");
          setLoading(false);
          return;
        }
      } else if (programmeType === "nvti") {
        if (formData.code.length < 1 || formData.code.length > 10) {
          toast.error("Subject code must be between 1 and 10 characters for NVTI programme type");
          setLoading(false);
          return;
        }
      }

      await createSubject(formData);
      toast.success("Subject created successfully");
      setFormData({ code: "", original_code: "", name: "", subject_type: "CORE", exam_type: "Certificate II Examination", programme_type: "cert2" });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create subject"
      );
      console.error("Error creating subject:", error);
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

  const handleExamTypeChange = (value: ExamType) => {
    setFormData((prev) => ({ ...prev, exam_type: value }));
  };

  const handleProgrammeTypeChange = (value: "cert2" | "nvti") => {
    setFormData((prev) => ({ ...prev, programme_type: value }));
  };

  const handleCancel = () => {
    setFormData({ code: "", original_code: "", name: "", subject_type: "CORE", exam_type: "Certificate II Examination", programme_type: "cert2" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Subject</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new subject. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Subject Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="code"
                name="code"
                type="text"
                value={formData.code}
                onChange={handleChange}
                required
                maxLength={10}
                placeholder={formData.programme_type === "nvti" ? "Enter subject code (1-10 characters)" : "Enter 3-character subject code"}
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {formData.programme_type === "nvti"
                  ? "Code can be 1-10 characters (saved as-is)"
                  : "Must be exactly 3 characters for CERT2 programme type"}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="original_code" className="text-sm font-medium">
                Original Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="original_code"
                name="original_code"
                type="text"
                value={formData.original_code}
                onChange={handleChange}
                required
                maxLength={50}
                placeholder="Enter original subject code (e.g., C30-1-01, C701)"
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The original subject code format (e.g., C30-1-01, C701)
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

            <div className="space-y-2">
              <label htmlFor="exam_type" className="text-sm font-medium">
                Exam Type <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.exam_type}
                onValueChange={handleExamTypeChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select exam type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Certificate II Examinations">Certificate II Examinations</SelectItem>
                  <SelectItem value="Advance">Advance</SelectItem>
                  <SelectItem value="Technician Part I">Technician Part I</SelectItem>
                  <SelectItem value="Technician Part II">Technician Part II</SelectItem>
                  <SelectItem value="Technician Part III">Technician Part III</SelectItem>
                  <SelectItem value="Diploma">Diploma</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="programme_type" className="text-sm font-medium">
                Programme Type <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.programme_type || "cert2"}
                onValueChange={handleProgrammeTypeChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select programme type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cert2">CERT2</SelectItem>
                  <SelectItem value="nvti">NVTI</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                CERT2: Code must be exactly 3 characters. NVTI: Code can be 1-10 characters.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
