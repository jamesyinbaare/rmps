"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getProgramme,
  getProgrammeSubjects,
  updateProgramme,
  getCurrentUser,
  addSubjectToProgramme,
  updateProgrammeSubject,
  removeSubjectFromProgramme,
  listAllSubjects,
} from "@/lib/api";
import type { Programme, ProgrammeSubjectRequirements, User, Subject, ProgrammeSubjectResponse } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, GraduationCap, Edit, Calendar, BookOpen, Loader2, Save, X, Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";

export default function ProgrammeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programmeId = params.id ? parseInt(params.id as string) : null;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [subjects, setSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ code: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [manageSubjectsDialogOpen, setManageSubjectsDialogOpen] = useState(false);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loadingAllSubjects, setLoadingAllSubjects] = useState(false);
  const [editSubjectDialogOpen, setEditSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{ subject_id: number; is_compulsory: boolean | null; choice_group_id: number | null } | null>(null);
  const [addSubjectDialogOpen, setAddSubjectDialogOpen] = useState(false);
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<number | null>(null);
  const [newSubjectIsCompulsory, setNewSubjectIsCompulsory] = useState<boolean>(true);
  const [newSubjectChoiceGroup, setNewSubjectChoiceGroup] = useState<number | null>(null);

  const isSystemAdmin = user?.role === "SystemAdmin";

  // Load programme data
  useEffect(() => {
    const loadData = async () => {
      if (!programmeId) {
        setError("Invalid programme ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [programmeData, userData] = await Promise.all([
          getProgramme(programmeId),
          getCurrentUser(),
        ]);
        setProgramme(programmeData);
        setUser(userData);
        setEditFormData({
          code: programmeData.code,
          name: programmeData.name,
        });

        // Load subjects
        setSubjectsLoading(true);
        try {
          const subjectsData = await getProgrammeSubjects(programmeId);
          setSubjects(subjectsData);
        } catch (err) {
          console.error("Failed to load programme subjects:", err);
        } finally {
          setSubjectsLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load programme");
        console.error("Error loading programme:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [programmeId]);

  const handleSave = async () => {
    if (!programmeId || !isSystemAdmin) return;

    setSaving(true);
    try {
      const updated = await updateProgramme(programmeId, editFormData);
      setProgramme(updated);
      setEditDialogOpen(false);
      toast.success("Programme updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update programme");
    } finally {
      setSaving(false);
    }
  };

  const loadAllSubjects = async () => {
    setLoadingAllSubjects(true);
    try {
      const subjects = await listAllSubjects();
      setAllSubjects(subjects);
    } catch (err) {
      toast.error("Failed to load subjects");
      console.error(err);
    } finally {
      setLoadingAllSubjects(false);
    }
  };

  const reloadSubjects = async () => {
    if (!programmeId) return;
    setSubjectsLoading(true);
    try {
      const subjectsData = await getProgrammeSubjects(programmeId);
      setSubjects(subjectsData);
    } catch (err) {
      console.error("Failed to reload subjects:", err);
    } finally {
      setSubjectsLoading(false);
    }
  };

  const handleAddSubject = async () => {
    if (!programmeId || !selectedSubjectToAdd) return;

    try {
      await addSubjectToProgramme(programmeId, selectedSubjectToAdd, {
        is_compulsory: newSubjectIsCompulsory ? true : (newSubjectChoiceGroup ? false : null),
        choice_group_id: newSubjectChoiceGroup,
      });
      toast.success("Subject added successfully");
      setAddSubjectDialogOpen(false);
      setSelectedSubjectToAdd(null);
      setNewSubjectIsCompulsory(true);
      setNewSubjectChoiceGroup(null);
      await reloadSubjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subject");
    }
  };

  const handleRemoveSubject = async (subjectId: number) => {
    if (!programmeId) return;

    if (!confirm("Are you sure you want to remove this subject from the programme?")) {
      return;
    }

    try {
      await removeSubjectFromProgramme(programmeId, subjectId);
      toast.success("Subject removed successfully");
      await reloadSubjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove subject");
    }
  };

  const handleEditSubject = (subject: ProgrammeSubjectResponse) => {
    setEditingSubject({
      subject_id: subject.subject_id,
      is_compulsory: subject.is_compulsory,
      choice_group_id: subject.choice_group_id,
    });
    setEditSubjectDialogOpen(true);
  };

  const handleSaveSubjectEdit = async () => {
    if (!programmeId || !editingSubject) return;

    try {
      await updateProgrammeSubject(programmeId, editingSubject.subject_id, {
        is_compulsory: editingSubject.is_compulsory,
        choice_group_id: editingSubject.choice_group_id,
      });
      toast.success("Subject updated successfully");
      setEditSubjectDialogOpen(false);
      setEditingSubject(null);
      await reloadSubjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update subject");
    }
  };

  const getAvailableSubjects = () => {
    if (!subjects) return allSubjects;
    const associatedSubjectIds = new Set([
      ...subjects.compulsory_core.map((s) => s.subject_id),
      ...subjects.optional_core_groups.flatMap((g) => g.subjects.map((s) => s.subject_id)),
      ...subjects.electives.map((s) => s.subject_id),
    ]);
    return allSubjects.filter((s) => !associatedSubjectIds.has(s.id));
  };

  const getMaxChoiceGroupId = () => {
    if (!subjects) return 0;
    return Math.max(
      0,
      ...subjects.optional_core_groups.map((g) => g.choice_group_id)
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !programme) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
          {error || "Programme not found"}
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const totalSubjects =
    (subjects?.compulsory_core.length || 0) +
    (subjects?.optional_core_groups.reduce((sum, group) => sum + group.subjects.length, 0) || 0) +
    (subjects?.electives.length || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{programme.name}</h1>
            <p className="text-muted-foreground font-mono">{programme.code}</p>
          </div>
        </div>
        {isSystemAdmin && (
          <Button onClick={() => setEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Programme
          </Button>
        )}
      </div>

      {/* Programme Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Programme Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Code:</span>
              <span className="text-sm font-medium font-mono">{programme.code}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Name:</span>
              <span className="text-sm font-medium">{programme.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="text-sm font-medium">
                {new Date(programme.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Subjects:</span>
              <span className="text-sm font-medium">{totalSubjects}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subjects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Subjects ({totalSubjects})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subjectsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !subjects ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Failed to load subjects.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Compulsory Core Subjects */}
              {subjects.compulsory_core.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Compulsory Core Subjects</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          {isSystemAdmin && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjects.compulsory_core.map((subject) => (
                          <TableRow key={subject.subject_id}>
                            <TableCell className="font-mono">{subject.subject_code}</TableCell>
                            <TableCell>{subject.subject_name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">CORE</Badge>
                            </TableCell>
                            {isSystemAdmin && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditSubject(subject)}
                                  >
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveSubject(subject.subject_id)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Optional Core Groups */}
              {subjects.optional_core_groups.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Optional Core Groups (Select one per group)</h3>
                  {subjects.optional_core_groups.map((group) => (
                    <div key={group.choice_group_id} className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        Group {group.choice_group_id}
                      </h4>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Code</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Type</TableHead>
                              {isSystemAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.subjects.map((subject) => (
                              <TableRow key={subject.subject_id}>
                                <TableCell className="font-mono">{subject.subject_code}</TableCell>
                                <TableCell>{subject.subject_name}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">CORE</Badge>
                                </TableCell>
                                {isSystemAdmin && (
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditSubject(subject)}
                                      >
                                        <Settings className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveSubject(subject.subject_id)}
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Elective Subjects */}
              {subjects.electives.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Elective Subjects</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          {isSystemAdmin && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjects.electives.map((subject) => (
                          <TableRow key={subject.subject_id}>
                            <TableCell className="font-mono">{subject.subject_code}</TableCell>
                            <TableCell>{subject.subject_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">ELECTIVE</Badge>
                            </TableCell>
                            {isSystemAdmin && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditSubject(subject)}
                                  >
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveSubject(subject.subject_id)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {totalSubjects === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No subjects associated with this programme.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog - Only visible to SYSTEM_ADMIN */}
      {isSystemAdmin && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Programme</DialogTitle>
              <DialogDescription>Update programme details.</DialogDescription>
            </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={editFormData.code}
                onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Add Subject Dialog */}
      {isSystemAdmin && (
        <Dialog open={addSubjectDialogOpen} onOpenChange={setAddSubjectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Subject to Programme</DialogTitle>
              <DialogDescription>Select a subject to add to this programme.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="subject-select">Subject</Label>
                {loadingAllSubjects ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading subjects...
                  </div>
                ) : (
                  <Select
                    value={selectedSubjectToAdd?.toString() || ""}
                    onValueChange={(value) => {
                      const subjectId = parseInt(value);
                      setSelectedSubjectToAdd(subjectId);
                      const subject = allSubjects.find((s) => s.id === subjectId);
                      if (subject?.subject_type === "CORE") {
                        setNewSubjectIsCompulsory(true);
                        setNewSubjectChoiceGroup(null);
                      } else {
                        setNewSubjectIsCompulsory(false);
                        setNewSubjectChoiceGroup(null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subject..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableSubjects().map((subject) => (
                        <SelectItem key={subject.id} value={subject.id.toString()}>
                          {subject.code} - {subject.name} ({subject.subject_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedSubjectToAdd && (
                <>
                  {allSubjects.find((s) => s.id === selectedSubjectToAdd)?.subject_type === "CORE" && (
                    <>
                      <div className="space-y-2">
                        <Label>Subject Type</Label>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={newSubjectIsCompulsory}
                              onChange={() => {
                                setNewSubjectIsCompulsory(true);
                                setNewSubjectChoiceGroup(null);
                              }}
                            />
                            <span className="text-sm">Compulsory</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={!newSubjectIsCompulsory}
                              onChange={() => setNewSubjectIsCompulsory(false)}
                            />
                            <span className="text-sm">Optional (Choice Group)</span>
                          </label>
                        </div>
                      </div>
                      {!newSubjectIsCompulsory && (
                        <div className="space-y-2">
                          <Label htmlFor="choice-group">Choice Group ID</Label>
                          <Input
                            id="choice-group"
                            type="number"
                            min="1"
                            value={newSubjectChoiceGroup?.toString() || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setNewSubjectChoiceGroup(value ? parseInt(value) : null);
                            }}
                            placeholder="Enter choice group ID"
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum existing group ID: {getMaxChoiceGroupId()}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSubjectDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleAddSubject} disabled={!selectedSubjectToAdd || loadingAllSubjects}>
                <Plus className="h-4 w-4 mr-2" />
                Add Subject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Subject Dialog */}
      {isSystemAdmin && editingSubject && (
        <Dialog open={editSubjectDialogOpen} onOpenChange={setEditSubjectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Subject Association</DialogTitle>
              <DialogDescription>Update how this subject is associated with the programme.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {subjects && (() => {
                const allProgrammeSubjects = [
                  ...subjects.compulsory_core,
                  ...subjects.optional_core_groups.flatMap((g) => g.subjects),
                  ...subjects.electives,
                ];
                const subject = allProgrammeSubjects.find((s) => s.subject_id === editingSubject.subject_id);
                return subject ? (
                  <>
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <p className="text-sm font-medium">
                        {subject.subject_code} - {subject.subject_name} ({subject.subject_type})
                      </p>
                    </div>
                    {subject.subject_type === "CORE" && (
                      <>
                        <div className="space-y-2">
                          <Label>Subject Type</Label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={editingSubject.is_compulsory === true}
                                onChange={() => {
                                  setEditingSubject({
                                    ...editingSubject,
                                    is_compulsory: true,
                                    choice_group_id: null,
                                  });
                                }}
                              />
                              <span className="text-sm">Compulsory</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={editingSubject.is_compulsory === false}
                                onChange={() => setEditingSubject({ ...editingSubject, is_compulsory: false })}
                              />
                              <span className="text-sm">Optional (Choice Group)</span>
                            </label>
                          </div>
                        </div>
                        {editingSubject.is_compulsory === false && (
                          <div className="space-y-2">
                            <Label htmlFor="edit-choice-group">Choice Group ID</Label>
                            <Input
                              id="edit-choice-group"
                              type="number"
                              min="1"
                              value={editingSubject.choice_group_id?.toString() || ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setEditingSubject({
                                  ...editingSubject,
                                  choice_group_id: value ? parseInt(value) : null,
                                });
                              }}
                              placeholder="Enter choice group ID"
                            />
                            <p className="text-xs text-muted-foreground">
                              Maximum existing group ID: {getMaxChoiceGroupId()}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : null;
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditSubjectDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveSubjectEdit}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
