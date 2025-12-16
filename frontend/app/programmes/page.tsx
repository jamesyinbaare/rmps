"use client";

import { useState, useEffect } from "react";
import { ProgrammeDataTable } from "@/components/ProgrammeDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { AddProgrammeDialog } from "@/components/AddProgrammeDialog";
import { ProgrammeDetailDrawer } from "@/components/ProgrammeDetailDrawer";
import { EditProgrammeModal } from "@/components/EditProgrammeModal";
import { DeleteProgrammeDialog } from "@/components/DeleteProgrammeDialog";
import { listProgrammes, getProgramme } from "@/lib/api";
import type { Programme } from "@/types/document";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState<Programme | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programmeToDelete, setProgrammeToDelete] = useState<Programme | null>(null);

  // Load all programmes once (fetch in batches since backend limits page_size to 100)
  const loadProgrammes = async () => {
    setLoading(true);
    setError(null);
    try {
      const allProgrammesList: Programme[] = [];
      let page = 1;
      let hasMore = true;

      // Fetch programmes in batches of 100 (backend limit)
      while (hasMore) {
        const response = await listProgrammes(page, 100);
        allProgrammesList.push(...response.items);
        hasMore = page < response.total_pages;
        page++;
      }

      setProgrammes(allProgrammesList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load programmes");
      console.error("Error loading programmes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProgrammes();
  }, []);

  const handleView = (programme: Programme) => {
    setSelectedProgramme(programme);
    setDrawerOpen(true);
  };

  const handleEdit = (programme: Programme) => {
    setSelectedProgramme(programme);
    setEditModalOpen(true);
  };

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    loadProgrammes();
  };

  const handleEditSuccess = async () => {
    // Reload programmes to get updated data
    await loadProgrammes();
    // Refresh drawer if it's open - reload the selected programme
    if (drawerOpen && selectedProgramme) {
      try {
        const updatedProgramme = await getProgramme(selectedProgramme.id);
        setSelectedProgramme(updatedProgramme);
      } catch (error) {
        console.error("Error refreshing programme:", error);
      }
    }
  };

  const handleDelete = (programme: Programme) => {
    setProgrammeToDelete(programme);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    loadProgrammes();
    // Close drawer/modal if the deleted programme is selected
    if (selectedProgramme?.id === programmeToDelete?.id) {
      setDrawerOpen(false);
      setEditModalOpen(false);
      setSelectedProgramme(null);
    }
    setProgrammeToDelete(null);
  };

  return (
    <DashboardLayout title="Programmes">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="All Programmes" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <div />
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Programme
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          <ProgrammeDataTable
            programmes={programmes}
            loading={loading}
            showSearch={true}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <AddProgrammeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <ProgrammeDetailDrawer
        programme={selectedProgramme}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <EditProgrammeModal
        programme={selectedProgramme}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={handleEditSuccess}
      />

      <DeleteProgrammeDialog
        programme={programmeToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={handleDeleteSuccess}
      />
    </DashboardLayout>
  );
}
