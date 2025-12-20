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
  type ProgrammeSubjectAssociationCreate,
  type ProgrammeSubjectAssociationUpdate,
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
  const [selectedIsCompulsory, setSelectedIsCompulsory] = useState<boolean | null>(null);
  const [selectedChoiceGroupId, setSelectedChoiceGroupId] = useState<string>("");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingIsCompulsory, setEditingIsCompulsory] = useState<boolean | null>(null);
  const [editingChoiceGroupId, setEditingChoiceGroupId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
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

    // Get the selected subject to check its type
    const selectedSubject = allSubjects.find((s) => s.id === subjectId);
    if (!selectedSubject) return;

    // Determine default values based on subject type
    let isCompulsory: boolean | null = null;
    let choiceGroupId: number | null = null;

    if (selectedSubject.subject_type === "CORE") {
      // For core subjects, use the selected values or default to compulsory
      isCompulsory = selectedIsCompulsory !== null ? selectedIsCompulsory : true;
      if (isCompulsory === false && selectedChoiceGroupId) {
        const parsedGroupId = parseInt(selectedChoiceGroupId);
        if (!isNaN(parsedGroupId) && parsedGroupId > 0) {
          choiceGroupId = parsedGroupId;
        }
      }
    }
    // For ELECTIVE subjects, both remain null

    const associationData: ProgrammeSubjectAssociationCreate = {
      is_compulsory: isCompulsory,
      choice_group_id: choiceGroupId,
    };

    setLoading(true);
    try {
      await addSubjectToProgramme(programme.id, subjectId, associationData);
      toast.success("Subject added to programme");
      // Reload subjects
      const updatedSubjects = await listProgrammeSubjects(programme.id);
      setSubjects(updatedSubjects);
      setSelectedSubjectId("");
      setSelectedIsCompulsory(null);
      setSelectedChoiceGroupId("");
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

  const handleEditSubject = (subject: ProgrammeSubject) => {
    setEditingSubjectId(subject.subject_id);
    setEditingIsCompulsory(subject.is_compulsory);
    setEditingChoiceGroupId(subject.choice_group_id?.toString() || "");
  };

  const handleSaveSubjectEdit = async (subjectId: number) => {
    if (!programme) return;

    const subject = subjects.find((s) => s.subject_id === subjectId);
    if (!subject) return;

    setUpdatingId(subjectId);
    try {
      const updateData: ProgrammeSubjectAssociationUpdate = {
        is_compulsory: editingIsCompulsory,
        choice_group_id: editingChoiceGroupId && editingChoiceGroupId.trim() !== ""
          ? (() => {
              const parsed = parseInt(editingChoiceGroupId);
              return !isNaN(parsed) && parsed > 0 ? parsed : null;
            })()
          : null,
      };

      await updateProgrammeSubject(programme.id, subjectId, updateData);
      toast.success("Subject requirements updated");
      // Reload subjects
      const updatedSubjects = await listProgrammeSubjects(programme.id);
      setSubjects(updatedSubjects);
      setEditingSubjectId(null);
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update subject requirements"
      );
      console.error("Error updating subject:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingSubjectId(null);
    setEditingIsCompulsory(null);
    setEditingChoiceGroupId("");
  };

  // Get unique choice group IDs for dropdown
  const choiceGroupIds = Array.from(
    new Set(
      subjects
        .filter((s) => s.choice_group_id !== null)
        .map((s) => s.choice_group_id!)
    )
  ).sort((a, b) => a - b);

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
            <div className="space-y-3">
              <div className="flex gap-2">
                <Select
                  value={selectedSubjectId}
                  onValueChange={(value) => {
                    setSelectedSubjectId(value);
                    // Reset fields when subject changes
                    const subject = allSubjects.find((s) => s.id === parseInt(value));
                    if (subject?.subject_type === "ELECTIVE") {
                      setSelectedIsCompulsory(null);
                      setSelectedChoiceGroupId("");
                    } else if (subject?.subject_type === "CORE") {
                      // Default to compulsory for core subjects
                      setSelectedIsCompulsory(true);
                      setSelectedChoiceGroupId("");
                    }
                  }}
                  disabled={loading || availableSubjects.length === 0}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id.toString()}>
                        {subject.code} - {subject.name} ({subject.subject_type})
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
              {selectedSubjectId && (
                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-muted">
                  {allSubjects.find((s) => s.id === parseInt(selectedSubjectId))?.subject_type === "CORE" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Compulsory?
                        </label>
                        <Select
                          value={selectedIsCompulsory === null ? "" : selectedIsCompulsory ? "true" : "false"}
                          onValueChange={(value) => {
                            if (value === "") {
                              setSelectedIsCompulsory(null);
                            } else {
                              setSelectedIsCompulsory(value === "true");
                              if (value === "true") {
                                setSelectedChoiceGroupId(""); // Clear choice group if compulsory
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Compulsory</SelectItem>
                            <SelectItem value="false">Optional</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedIsCompulsory === false && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Choice Group ID
                          </label>
                          <Input
                            type="number"
                            value={selectedChoiceGroupId}
                            onChange={(e) => setSelectedChoiceGroupId(e.target.value)}
                            placeholder="Group ID"
                            className="h-8"
                            min="1"
                          />
                        </div>
                      )}
                    </>
                  )}
                  {allSubjects.find((s) => s.id === parseInt(selectedSubjectId))?.subject_type === "ELECTIVE" && (
                    <div className="text-xs text-muted-foreground col-span-2">
                      Elective subjects are automatically set as required for MAY/JUNE exams
                    </div>
                  )}
                </div>
              )}
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
                      <TableHead>Requirements</TableHead>
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
                          <Badge
                            variant={subject.subject_type === "CORE" ? "default" : "secondary"}
                          >
                            {subject.subject_type === "CORE" ? "Core" : "Elective"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {editingSubjectId === subject.subject_id ? (
                            <div className="flex gap-2 items-center">
                              {subject.subject_type === "CORE" ? (
                                <>
                                  <Select
                                    value={editingIsCompulsory === null ? "" : editingIsCompulsory ? "true" : "false"}
                                    onValueChange={(value) => {
                                      if (value === "") {
                                        setEditingIsCompulsory(null);
                                      } else {
                                        setEditingIsCompulsory(value === "true");
                                        if (value === "true") {
                                          setEditingChoiceGroupId("");
                                        }
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="true">Compulsory</SelectItem>
                                      <SelectItem value="false">Optional</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {editingIsCompulsory === false && (
                                    <Input
                                      type="number"
                                      value={editingChoiceGroupId}
                                      onChange={(e) => setEditingChoiceGroupId(e.target.value)}
                                      placeholder="Group ID"
                                      className="h-8 w-24"
                                      min="1"
                                    />
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSaveSubjectEdit(subject.subject_id)}
                                    disabled={updatingId === subject.subject_id}
                                    className="h-8"
                                  >
                                    {updatingId === subject.subject_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Save"
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEdit}
                                    className="h-8"
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Required for MAY/JUNE</span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {subject.subject_type === "CORE" ? (
                                <>
                                  {subject.is_compulsory === true && (
                                    <Badge variant="outline" className="text-xs">Compulsory</Badge>
                                  )}
                                  {subject.is_compulsory === false && (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs">Optional</Badge>
                                      {subject.choice_group_id && (
                                        <span className="text-xs text-muted-foreground">
                                          Group {subject.choice_group_id}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <Badge variant="outline" className="text-xs">Required (MAY/JUNE)</Badge>
                              )}
                              {subject.subject_type === "CORE" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditSubject(subject)}
                                  className="h-6 text-xs mt-1"
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSubject(subject.subject_id)}
                            disabled={removingId === subject.subject_id || editingSubjectId === subject.subject_id}
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
