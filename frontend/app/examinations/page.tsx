"use client";

import { useState, useEffect } from "react";
import { ExamDataTable } from "@/components/ExamDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { AddExamDialog } from "@/components/AddExamDialog";
import { ExamDetailDrawer } from "@/components/ExamDetailDrawer";
import { EditExamModal } from "@/components/EditExamModal";
import { DeleteExamDialog } from "@/components/DeleteExamDialog";
import { listExams, getExam } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ExaminationsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

  // Load all exams once (fetch in batches since backend limits page_size to 100)
  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const allExamsList: Exam[] = [];
      let page = 1;
      let hasMore = true;

      // Fetch exams in batches of 100 (backend limit)
      while (hasMore) {
        const response = await listExams(page, 100);
        allExamsList.push(...response.items);
        hasMore = page < response.total_pages;
        page++;
      }

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

  const handleView = (exam: Exam) => {
    setSelectedExam(exam);
    setDrawerOpen(true);
  };

  const handleEdit = (exam: Exam) => {
    setSelectedExam(exam);
    setEditModalOpen(true);
  };

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    loadExams();
  };

  const handleEditSuccess = async () => {
    // Reload exams to get updated data
    await loadExams();
    // Refresh drawer if it's open - reload the selected exam
    if (drawerOpen && selectedExam) {
      try {
        const updatedExam = await getExam(selectedExam.id);
        setSelectedExam(updatedExam);
      } catch (error) {
        console.error("Error refreshing examination:", error);
      }
    }
  };

  const handleDelete = (exam: Exam) => {
    setExamToDelete(exam);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    loadExams();
    // Close drawer/modal if the deleted exam is selected
    if (selectedExam?.id === examToDelete?.id) {
      setDrawerOpen(false);
      setEditModalOpen(false);
      setSelectedExam(null);
    }
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
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <AddExamDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <ExamDetailDrawer
        exam={selectedExam}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <EditExamModal
        exam={selectedExam}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={handleEditSuccess}
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
