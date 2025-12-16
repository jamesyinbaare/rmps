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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listProgrammeSubjects,
  listSubjects,
  addSubjectToProgramme,
  removeSubjectFromProgramme,
  updateProgrammeSubject,
  updateProgramme,
  type ProgrammeSubject,
} from "@/lib/api";
import type { Programme, Subject } from "@/types/document";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EditProgrammeModalProps {
  programme: Programme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditProgrammeModal({
  programme,
  open,
  onOpenChange,
  onSuccess,
}: EditProgrammeModalProps) {
  const [subjects, setSubjects] = useState<ProgrammeSubject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [programmeData, setProgrammeData] = useState({
    code: "",
    name: "",
  });
  const [savingProgramme, setSavingProgramme] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!programme || !open) {
        setSubjects([]);
        return;
      }

      // Set programme form data
      setProgrammeData({
        code: programme.code,
        name: programme.name,
      });

      setSubjectsLoading(true);
      try {
        // Load programme subjects
        const programmeSubjects = await listProgrammeSubjects(programme.id);
        setSubjects(programmeSubjects);

        // Load all subjects
        const allSubjectsList: Subject[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const subjectsData = await listSubjects(page, 100);
          allSubjectsList.push(...subjectsData);
          hasMore = subjectsData.length === 100;
          page++;
        }
        setAllSubjects(allSubjectsList);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load programme data"
        );
        console.error("Error loading data:", err);
      } finally {
        setSubjectsLoading(false);
      }
    };

    loadData();
  }, [programme, open]);

  const handleAddSubject = async () => {
    if (!programme || !selectedSubjectId) return;

    const subjectId = parseInt(selectedSubjectId);
    if (subjects.some((s) => s.subject_id === subjectId)) {
      toast.error("Subject is already associated with this programme");
      return;
    }

    setLoading(true);
    try {
      await addSubjectToProgramme(programme.id, subjectId);
      toast.success("Subject added to programme");
      // Reload subjects
      const updatedSubjects = await listProgrammeSubjects(programme.id);
      setSubjects(updatedSubjects);
      setSelectedSubjectId("");
      // Don't call onSuccess here - keep modal open
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add subject"
      );
      console.error("Error adding subject:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgramme = async () => {
    if (!programme) return;

    setSavingProgramme(true);
    try {
      await updateProgramme(programme.id, {
        code: programmeData.code,
        name: programmeData.name,
      });
      toast.success("Programme updated successfully");
      // Don't close modal, just refresh data
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update programme"
      );
      console.error("Error updating programme:", err);
    } finally {
      setSavingProgramme(false);
    }
  };

  const handleRemoveSubject = async (subjectId: number) => {
    if (!programme) return;

    setRemovingId(subjectId);
    try {
      await removeSubjectFromProgramme(programme.id, subjectId);
      toast.success("Subject removed from programme");
      // Reload subjects
      const updatedSubjects = await listProgrammeSubjects(programme.id);
      setSubjects(updatedSubjects);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove subject"
      );
      console.error("Error removing subject:", err);
    } finally {
      setRemovingId(null);
    }
  };

  const handleToggleCore = async (subjectId: number, currentSubjectType: "CORE" | "ELECTIVE") => {
    if (!programme) return;

    try {
      const newSubjectType = currentSubjectType === "CORE" ? "ELECTIVE" : "CORE";
      await updateProgrammeSubject(programme.id, subjectId, newSubjectType);
      toast.success("Subject type updated");
      // Reload subjects
      const updatedSubjects = await listProgrammeSubjects(programme.id);
      setSubjects(updatedSubjects);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update subject type"
      );
      console.error("Error updating subject:", err);
    }
  };

  // Get available subjects (not already in programme)
  const availableSubjects = allSubjects.filter(
    (subject) => !subjects.some((ps) => ps.subject_id === subject.id)
  );

  if (!programme) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Programme: {programme.name}</DialogTitle>
          <DialogDescription>
            Edit programme details and manage subjects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Programme Details Section */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="text-sm font-semibold">Programme Details</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-code" className="text-sm font-medium">
                  Programme Code <span className="text-destructive">*</span>
                </label>
                <Input
                  id="edit-code"
                  type="text"
                  value={programmeData.code}
                  onChange={(e) =>
                    setProgrammeData((prev) => ({ ...prev, code: e.target.value }))
                  }
                  required
                  maxLength={50}
                  disabled={savingProgramme}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-name" className="text-sm font-medium">
                  Programme Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="edit-name"
                  type="text"
                  value={programmeData.name}
                  onChange={(e) =>
                    setProgrammeData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  maxLength={255}
                  disabled={savingProgramme}
                />
              </div>
              <Button
                type="button"
                onClick={handleSaveProgramme}
                disabled={savingProgramme || !programmeData.code || !programmeData.name}
                className="w-full"
              >
                {savingProgramme ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Programme Details"
                )}
              </Button>
            </div>
          </div>

          {/* Add Subject Section */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="text-sm font-semibold">Add Subject</h3>
            <div className="flex gap-2">
              <Select
                value={selectedSubjectId}
                onValueChange={setSelectedSubjectId}
                disabled={loading || availableSubjects.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      {subject.code} - {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddSubject}
                disabled={!selectedSubjectId || loading || availableSubjects.length === 0}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>

          {/* Subjects List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Programme Subjects ({subjects.length})
            </h3>
            {subjectsLoading ? (
              <div className="text-sm text-muted-foreground py-4">
                Loading subjects...
              </div>
            ) : subjects.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No subjects associated with this programme.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjects.map((subject) => (
                      <TableRow key={subject.subject_id}>
                        <TableCell className="font-mono">
                          {subject.subject_code}
                        </TableCell>
                        <TableCell>{subject.subject_name}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleToggleCore(
                                subject.subject_id,
                                subject.subject_type
                              )
                            }
                            className="h-auto p-0"
                          >
                            <Badge
                              variant={subject.subject_type === "CORE" ? "default" : "secondary"}
                            >
                              {subject.subject_type === "CORE" ? "Core" : "Elective"}
                            </Badge>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSubject(subject.subject_id)}
                            disabled={removingId === subject.subject_id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {removingId === subject.subject_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
