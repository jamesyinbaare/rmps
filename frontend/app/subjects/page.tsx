"use client";

import { useState, useEffect } from "react";
import { SubjectDataTable } from "@/components/SubjectDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { AddSubjectDialog } from "@/components/AddSubjectDialog";
import { DeleteSubjectDialog } from "@/components/DeleteSubjectDialog";
import { listSubjects } from "@/lib/api";
import type { Subject } from "@/types/document";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  // Load all subjects once (fetch in batches since backend limits page_size to 100)
  const loadSubjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const allSubjectsList: Subject[] = [];
      let page = 1;
      let hasMore = true;

      // Fetch subjects in batches of 100 (backend limit)
      while (hasMore) {
        const subjectsData = await listSubjects(page, 100);
        allSubjectsList.push(...subjectsData);
        hasMore = subjectsData.length === 100;
        page++;
      }

      setSubjects(allSubjectsList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subjects");
      console.error("Error loading subjects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    loadSubjects();
  };

  const handleDelete = (subject: Subject) => {
    setSubjectToDelete(subject);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    loadSubjects();
    setSubjectToDelete(null);
  };

  return (
    <DashboardLayout title="Subjects">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="All Subjects" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <div />
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Subject
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <SubjectDataTable
            subjects={subjects}
            loading={loading}
            showSearch={true}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <AddSubjectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <DeleteSubjectDialog
        subject={subjectToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={handleDeleteSuccess}
      />
    </DashboardLayout>
  );
}
