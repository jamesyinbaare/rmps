"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CandidateForm } from "@/components/CandidateForm";
import type { School, Programme } from "@/types/document";
import { Plus } from "lucide-react";

interface CandidateDialogProps {
  schools: School[];
  programmes: Programme[];
  schoolId?: number;
  onSuccess?: () => void;
}

export function CandidateDialog({ schools, programmes, schoolId, onSuccess }: CandidateDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.();
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Candidate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Candidate</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new candidate. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <CandidateForm
          schools={schools}
          programmes={programmes}
          defaultSchoolId={schoolId}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  );
}
