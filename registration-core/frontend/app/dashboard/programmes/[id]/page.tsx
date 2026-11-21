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
  listAttachableSubjects,
  getProgrammeTypeTree,
} from "@/lib/api";
import type {
  Programme,
  ProgrammeSubjectRequirements,
  User,
  Subject,
  ProgrammeSubjectResponse,
  ProgrammeTypeTreeNode,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PageHeader } from "@/components/dashboard/PageHeader";

type SubjectTypeFilter = "ALL" | "CORE" | "ELECTIVE";

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
  const [editFormData, setEditFormData] = useState({
    code: "",
    name: "",
    programme_type_id: "" as string,
  });
  const [typeOptions, setTypeOptions] = useState<{ id: number; path: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [attachableSubjects, setAttachableSubjects] = useState<Subject[]>([]);
  const [loadingAttachableSubjects, setLoadingAttachableSubjects] = useState(false);
  const [editSubjectDialogOpen, setEditSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{ subject_id: number; is_compulsory: boolean | null; choice_group_id: number | null } | null>(null);
  const [addSubjectDialogOpen, setAddSubjectDialogOpen] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<number>>(new Set());
  const [subjectSearch, setSubjectSearch] = useState("");
  const [addingSubjects, setAddingSubjects] = useState(false);
  const [newSubjectIsCompulsory, setNewSubjectIsCompulsory] = useState<boolean>(true);
  const [newSubjectChoiceGroup, setNewSubjectChoiceGroup] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilter>("ALL");

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
          programme_type_id: programmeData.programme_type_id
            ? String(programmeData.programme_type_id)
            : "",
        });
        try {
          const tree = await getProgrammeTypeTree(true);
          const flat: { id: number; path: string }[] = [];
          const walk = (nodes: ProgrammeTypeTreeNode[]) => {
            for (const n of nodes) {
              flat.push({ id: n.id, path: n.path || n.name });
              if (n.children?.length) walk(n.children);
            }
          };
          walk(tree);
          setTypeOptions(flat);
        } catch {
          /* optional */
        }

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
      const updated = await updateProgramme(programmeId, {
        code: editFormData.code,
        name: editFormData.name,
        programme_type_id: editFormData.programme_type_id
          ? parseInt(editFormData.programme_type_id, 10)
          : undefined,
      });
      setProgramme(updated);
      setEditDialogOpen(false);
      toast.success("Programme updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update programme");
    } finally {
      setSaving(false);
    }
  };

  const loadAttachableSubjects = async () => {
    if (!programmeId) return;
    setLoadingAttachableSubjects(true);
    try {
      const subjects = await listAttachableSubjects(programmeId);
      setAttachableSubjects(subjects);
    } catch (err) {
      toast.error("Failed to load subjects");
      console.error(err);
    } finally {
      setLoadingAttachableSubjects(false);
    }
  };

  useEffect(() => {
    if (addSubjectDialogOpen) {
      void loadAttachableSubjects();
    }
  }, [addSubjectDialogOpen, programmeId]);

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

  const resetAddSubjectDialog = () => {
    setSelectedSubjectIds(new Set());
    setSubjectSearch("");
    setSubjectTypeFilter("ALL");
    setNewSubjectIsCompulsory(true);
    setNewSubjectChoiceGroup(null);
  };

  const buildPayloadForSubject = (subject: Subject) => {
    if (subject.subject_type === "ELECTIVE") {
      return { is_compulsory: null as boolean | null, choice_group_id: null as number | null };
    }
    if (newSubjectIsCompulsory) {
      return { is_compulsory: true as boolean | null, choice_group_id: null as number | null };
    }
    return {
      is_compulsory: false as boolean | null,
      choice_group_id: newSubjectChoiceGroup,
    };
  };

  const handleAddSubjects = async () => {
    if (!programmeId || selectedSubjectIds.size === 0) return;

    const selected = attachableSubjects.filter((s) => selectedSubjectIds.has(s.id));
    const hasOptionalCore = selected.some(
      (s) => s.subject_type === "CORE" && !newSubjectIsCompulsory
    );
    if (hasOptionalCore && (!newSubjectChoiceGroup || newSubjectChoiceGroup <= 0)) {
      toast.error("Choice group ID is required for optional core subjects");
      return;
    }

    setAddingSubjects(true);
    let successCount = 0;
    let firstError: string | null = null;
    const succeeded = new Set<number>();

    for (const subject of selected) {
      try {
        await addSubjectToProgramme(programmeId, subject.id, buildPayloadForSubject(subject));
        successCount += 1;
        succeeded.add(subject.id);
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err.message : "Failed to add subject";
        }
      }
    }

    setAddingSubjects(false);
    await reloadSubjects();

    if (firstError) {
      const remaining = new Set(
        [...selectedSubjectIds].filter((id) => !succeeded.has(id))
      );
      setSelectedSubjectIds(remaining);
      setAttachableSubjects((prev) => prev.filter((s) => !succeeded.has(s.id)));
      toast.error(
        successCount > 0
          ? `Added ${successCount}, but some failed: ${firstError}`
          : firstError
      );
      return;
    }

    toast.success(
      successCount === 1
        ? "Subject added successfully"
        : `${successCount} subjects added successfully`
    );
    setAddSubjectDialogOpen(false);
    resetAddSubjectDialog();
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

  const getFilteredAvailableSubjects = () => {
    let available = attachableSubjects;
    if (subjectTypeFilter !== "ALL") {
      available = available.filter((s) => s.subject_type === subjectTypeFilter);
    }
    const searchLower = subjectSearch.trim().toLowerCase();
    if (searchLower) {
      available = available.filter((s) => {
        const haystack = `${s.code} ${s.original_code || ""} ${s.name}`.toLowerCase();
        return haystack.includes(searchLower);
      });
    }
    return available;
  };

  const formatSubjectOptionLabel = (subject: Subject) => {
    const codePart = subject.original_code
      ? `${subject.code} / ${subject.original_code}`
      : subject.code;
    return `${codePart} — ${subject.name} (${subject.subject_type})`;
  };

  const handleSubjectTypeFilterChange = (filter: SubjectTypeFilter) => {
    setSubjectTypeFilter(filter);
    if (filter === "ALL") return;
    setSelectedSubjectIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        const subject = attachableSubjects.find((s) => s.id === id);
        if (subject && subject.subject_type === filter) next.add(id);
      }
      return next;
    });
  };

  const toggleSubjectSelection = (subjectId: number) => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const selectFilteredSubjects = () => {
    const filtered = getFilteredAvailableSubjects();
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      for (const subject of filtered) next.add(subject.id);
      return next;
    });
  };

  const clearFilteredSubjects = () => {
    const filteredIds = new Set(getFilteredAvailableSubjects().map((s) => s.id));
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.delete(id);
      return next;
    });
  };

  const selectedHasCore = [...selectedSubjectIds].some((id) => {
    const subject = attachableSubjects.find((s) => s.id === id);
    return subject?.subject_type === "CORE";
  });

  const getMaxChoiceGroupId = () => {
    if (!subjects) return 0;
    return Math.max(
      0,
      ...subjects.optional_core_groups.map((g) => g.choice_group_id)
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
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
      <div className="mx-auto max-w-5xl space-y-6">
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
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
        title={programme.name}
        subtitle={<span className="font-mono">{programme.code}</span>}
        actions={
          isSystemAdmin ? (
            <Button onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Programme
            </Button>
          ) : undefined
        }
      />

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
              <span className="text-sm text-muted-foreground">Programme type:</span>
              <span className="text-sm font-medium">
                {programme.programme_type_path ||
                  programme.programme_type_name ||
                  "—"}
              </span>
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Subjects ({totalSubjects})
          </CardTitle>
          {isSystemAdmin && (
            <Button
              size="sm"
              onClick={() => {
                resetAddSubjectDialog();
                setAddSubjectDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Subjects
            </Button>
          )}
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
            <div className="space-y-2">
              <Label>Programme type</Label>
              <Select
                value={editFormData.programme_type_id}
                onValueChange={(value) =>
                  setEditFormData({ ...editFormData, programme_type_id: value })
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select programme type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Add Subjects Dialog */}
      {isSystemAdmin && (
        <Dialog
          open={addSubjectDialogOpen}
          onOpenChange={(open) => {
            setAddSubjectDialogOpen(open);
            if (!open) resetAddSubjectDialog();
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Add Subjects to Programme</DialogTitle>
              <DialogDescription>
                CORE subjects plus subjects already used on programmes of the same type.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "ALL", label: "All" },
                      { value: "CORE", label: "Core" },
                      { value: "ELECTIVE", label: "Elective" },
                    ] as const
                  ).map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={subjectTypeFilter === option.value ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => handleSubjectTypeFilterChange(option.value)}
                      disabled={loadingAttachableSubjects}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label>
                    Subjects ({selectedSubjectIds.size} selected
                    {!loadingAttachableSubjects
                      ? `, ${getFilteredAvailableSubjects().length} shown`
                      : ""}
                    )
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectFilteredSubjects}
                      disabled={loadingAttachableSubjects || getFilteredAvailableSubjects().length === 0}
                    >
                      Select filtered
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFilteredSubjects}
                      disabled={selectedSubjectIds.size === 0}
                    >
                      Clear filtered
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder="Search by code or name..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  disabled={loadingAttachableSubjects}
                />
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {loadingAttachableSubjects ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading subjects...
                    </div>
                  ) : attachableSubjects.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No subjects available to add. CORE subjects and subjects already linked to
                      programmes of this type will appear here once they exist and are not already
                      on this programme.
                    </p>
                  ) : getFilteredAvailableSubjects().length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No subjects match your filters. Try another type or search.
                    </p>
                  ) : (
                    getFilteredAvailableSubjects().map((subject) => (
                      <label
                        key={subject.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selectedSubjectIds.has(subject.id)}
                          onCheckedChange={() => toggleSubjectSelection(subject.id)}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {formatSubjectOptionLabel(subject)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {selectedHasCore && (
                <>
                  <div className="space-y-2">
                    <Label>Association (applies to selected CORE subjects)</Label>
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
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddSubjectDialogOpen(false)}
                disabled={addingSubjects}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleAddSubjects}
                disabled={
                  selectedSubjectIds.size === 0 ||
                  loadingAttachableSubjects ||
                  addingSubjects ||
                  (selectedHasCore &&
                    !newSubjectIsCompulsory &&
                    (!newSubjectChoiceGroup || newSubjectChoiceGroup <= 0))
                }
              >
                {addingSubjects ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {selectedSubjectIds.size <= 1
                  ? "Add Subject"
                  : `Add ${selectedSubjectIds.size} Subjects`}
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
