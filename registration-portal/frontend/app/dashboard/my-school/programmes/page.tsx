"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listSchoolProgrammes, associateProgrammeWithSchool, removeProgrammeFromSchool, listAvailableProgrammes } from "@/lib/api";
import { toast } from "sonner";
import type { Programme, ProgrammeListResponse } from "@/types";
import { BookOpen, Plus, X, Search, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SchoolProgrammesPage() {
  const router = useRouter();
  const [schoolProgrammes, setSchoolProgrammes] = useState<Programme[]>([]);
  const [allProgrammes, setAllProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programmeToDelete, setProgrammeToDelete] = useState<Programme | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [availableProgrammes, setAvailableProgrammes] = useState<Programme[]>([]);

  const loadSchoolProgrammes = useCallback(async () => {
    setLoading(true);
    try {
      const programmes = await listSchoolProgrammes();
      setSchoolProgrammes(programmes);
    } catch (error) {
      toast.error("Failed to load school programmes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllProgrammes = useCallback(async () => {
    try {
      // Load all available programmes (created by system admin)
      const programmes = await listAvailableProgrammes();
      setAllProgrammes(programmes);
    } catch (error) {
      toast.error("Failed to load available programmes");
      console.error(error);
    }
  }, []);

  useEffect(() => {
    loadSchoolProgrammes();
    loadAllProgrammes();
  }, [loadSchoolProgrammes, loadAllProgrammes]);

  useEffect(() => {
    if (addDialogOpen) {
      // Filter out programmes already associated with school
      const schoolProgrammeIds = new Set(schoolProgrammes.map((p) => p.id));
      const available = allProgrammes.filter((p) => !schoolProgrammeIds.has(p.id));

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        setAvailableProgrammes(
          available.filter(
            (p) =>
              p.code.toLowerCase().includes(query) ||
              p.name.toLowerCase().includes(query)
          )
        );
      } else {
        setAvailableProgrammes(available);
      }
    }
  }, [addDialogOpen, allProgrammes, schoolProgrammes, searchQuery]);

  const handleAddProgramme = async (programmeId: number) => {
    try {
      await associateProgrammeWithSchool(programmeId);
      toast.success("Programme added successfully");
      loadSchoolProgrammes();
      setAddDialogOpen(false);
      setSearchQuery("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add programme");
    }
  };

  const handleRemoveClick = (programme: Programme) => {
    setProgrammeToDelete(programme);
    setDeleteDialogOpen(true);
    setDeleteConfirmText("");
  };

  const handleDeleteConfirm = async () => {
    if (!programmeToDelete) return;

    if (deleteConfirmText.toLowerCase() !== "delete") {
      toast.error('Please type "delete" to confirm');
      return;
    }

    setDeleting(true);
    try {
      await removeProgrammeFromSchool(programmeToDelete.id);
      toast.success("Programme removed successfully");
      loadSchoolProgrammes();
      setDeleteDialogOpen(false);
      setProgrammeToDelete(null);
      setDeleteConfirmText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove programme");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setProgrammeToDelete(null);
    setDeleteConfirmText("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manage Programmes</h1>
          <p className="text-muted-foreground">Manage programmes available for your school</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Programme
        </Button>
      </div>

      {/* Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            School Programmes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{schoolProgrammes.length}</div>
          <p className="text-sm text-muted-foreground">Programmes available for registration</p>
        </CardContent>
      </Card>

      {/* Programmes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Programmes List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : schoolProgrammes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No programmes added yet. Click "Add Programme" to get started.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolProgrammes.map((programme) => (
                    <TableRow key={programme.id}>
                      <TableCell
                        className="font-medium font-mono cursor-pointer hover:underline"
                        onClick={() => router.push(`/dashboard/programmes/${programme.id}`)}
                      >
                        {programme.code}
                      </TableCell>
                      <TableCell
                        className="cursor-pointer hover:underline"
                        onClick={() => router.push(`/dashboard/programmes/${programme.id}`)}
                      >
                        {programme.name}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveClick(programme);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Programme Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Programme to School</DialogTitle>
            <DialogDescription>
              Select a programme to make it available for candidate registration in your school.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search programmes by code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Available Programmes List */}
            <div className="border rounded-md max-h-96 overflow-y-auto">
              {availableProgrammes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No programmes found matching your search" : "No available programmes"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableProgrammes.map((programme) => (
                      <TableRow key={programme.id}>
                        <TableCell className="font-medium font-mono">{programme.code}</TableCell>
                        <TableCell>{programme.name}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleAddProgramme(programme.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddDialogOpen(false);
              setSearchQuery("");
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Remove Programme
            </DialogTitle>
            <DialogDescription>
              This will remove the programme from your school's list. Candidates will no longer be able to register for this programme.
            </DialogDescription>
          </DialogHeader>
          {programmeToDelete && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border p-4 bg-muted">
                <p className="text-sm font-medium">Programme to remove:</p>
                <p className="text-sm font-mono mt-1">{programmeToDelete.code}</p>
                <p className="text-sm mt-1">{programmeToDelete.name}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">
                  Type <span className="font-mono font-semibold">delete</span> to confirm:
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="delete"
                  disabled={deleting}
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || deleteConfirmText.toLowerCase() !== "delete"}
            >
              {deleting ? "Removing..." : "Remove Programme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
