"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CreateExamDialog } from "@/components/admin/CreateExamDialog";
import { ExamTable } from "@/components/admin/ExamTable";
import { listExams } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";
import { Plus } from "lucide-react";

export default function ExamsPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadExams = async () => {
    setLoading(true);
    try {
      const data = await listExams();
      setExams(data);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Examinations</h1>
          <p className="text-gray-600">Set up and manage examination registration periods</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Exam
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <ExamTable exams={exams} onRefresh={loadExams} />
      )}

      <CreateExamDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={loadExams} />
    </div>
  );
}
