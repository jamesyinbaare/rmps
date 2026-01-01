"use client";

import { useState, useEffect } from "react";
import { ExamDataTable } from "@/components/ExamDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { AddExamDialog } from "@/components/AddExamDialog";
import { DeleteExamDialog } from "@/components/DeleteExamDialog";
import { getAllExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ExaminationsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

  // Load all exams
  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const allExamsList = await getAllExams();
      setExams(allExamsList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load examinations");
      console.error("Error loading examinations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    loadExams();
  };

  const handleDelete = (exam: Exam) => {
    setExamToDelete(exam);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    loadExams();
    setExamToDelete(null);
  };

  return (
    <DashboardLayout title="Examinations">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="All Examinations" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <div />
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Examination
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <ExamDataTable
            exams={exams}
            loading={loading}
            showSearch={true}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <AddExamDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <DeleteExamDialog
        exam={examToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={handleDeleteSuccess}
      />
    </DashboardLayout>
  );
}
