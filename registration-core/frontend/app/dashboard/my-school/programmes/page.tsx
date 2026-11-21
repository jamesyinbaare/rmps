"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  listSchoolProgrammes,
  associateProgrammeWithSchool,
  removeProgrammeFromSchool,
  listAvailableProgrammes,
  getCurrentUser,
} from "@/lib/api";
import { toast } from "sonner";
import type { Programme, User } from "@/types";
import { Plus, X, Search, AlertTriangle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip, type StatStripItem } from "@/components/dashboard/StatStrip";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type TypeOption = { id: number; label: string };

function programmeMatchesSearch(programme: Programme, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    programme.code.toLowerCase().includes(q) ||
    programme.name.toLowerCase().includes(q) ||
    (programme.programme_type_name || "").toLowerCase().includes(q)
  );
}

function deriveTypeOptions(programmes: Programme[]): TypeOption[] {
  const byId = new Map<number, string>();
  for (const programme of programmes) {
    if (programme.programme_type_id == null) continue;
    const label =
      programme.programme_type_name?.trim() ||
      `Type ${programme.programme_type_id}`;
    if (!byId.has(programme.programme_type_id)) {
      byId.set(programme.programme_type_id, label);
    }
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function SchoolProgrammesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [schoolProgrammes, setSchoolProgrammes] = useState<Programme[]>([]);
  const [allProgrammes, setAllProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programmeToDelete, setProgrammeToDelete] = useState<Programme | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [listSearch, setListSearch] = useState("");
  const [listTypeId, setListTypeId] = useState<number | null>(null);

  const [addSearch, setAddSearch] = useState("");
  const [addTypeId, setAddTypeId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  const isSchoolAdmin = user?.role === "SchoolAdmin";

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
      const programmes = await listAvailableProgrammes();
      setAllProgrammes(programmes);
    } catch (error) {
      toast.error("Failed to load available programmes");
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
    loadSchoolProgrammes();
    loadAllProgrammes();
  }, [loadSchoolProgrammes, loadAllProgrammes]);

  const catalogTypeOptions = useMemo(
    () => deriveTypeOptions(allProgrammes),
    [allProgrammes]
  );

  const listTypeOptions = useMemo(() => {
    const fromSchool = deriveTypeOptions(schoolProgrammes);
    return fromSchool.length > 0 ? fromSchool : catalogTypeOptions;
  }, [schoolProgrammes, catalogTypeOptions]);

  const programmeKpis = useMemo((): StatStripItem[] => {
    const byType = new Map<string, number>();
    for (const programme of schoolProgrammes) {
      const label = programme.programme_type_name?.trim() || "Unassigned";
      byType.set(label, (byType.get(label) || 0) + 1);
    }
    const typeItems: StatStripItem[] = [...byType.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
    return [
      {
        label: "School Programmes",
        value: schoolProgrammes.length,
        hint: "Available for registration",
      },
      ...typeItems,
    ];
  }, [schoolProgrammes]);

  const filteredSchoolProgrammes = useMemo(() => {
    return schoolProgrammes.filter((programme) => {
      if (listTypeId != null && programme.programme_type_id !== listTypeId) {
        return false;
      }
      return programmeMatchesSearch(programme, listSearch.trim());
    });
  }, [schoolProgrammes, listSearch, listTypeId]);

  const availableForAdd = useMemo(() => {
    const schoolIds = new Set(schoolProgrammes.map((p) => p.id));
    return allProgrammes.filter((p) => !schoolIds.has(p.id));
  }, [allProgrammes, schoolProgrammes]);

  const filteredAvailableForAdd = useMemo(() => {
    return availableForAdd.filter((programme) => {
      if (addTypeId != null && programme.programme_type_id !== addTypeId) {
        return false;
      }
      return programmeMatchesSearch(programme, addSearch.trim());
    });
  }, [availableForAdd, addSearch, addTypeId]);

  const resetAddDialog = () => {
    setAddSearch("");
    setAddTypeId(null);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const programme of filteredAvailableForAdd) next.add(programme.id);
      return next;
    });
  };

  const clearFiltered = () => {
    const filteredIds = new Set(filteredAvailableForAdd.map((p) => p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.delete(id);
      return next;
    });
  };

  const handleAddProgrammes = async () => {
    if (selectedIds.size === 0) return;

    const ids = [...selectedIds];
    setAdding(true);
    let successCount = 0;
    let firstError: string | null = null;
    const succeeded = new Set<number>();

    for (const programmeId of ids) {
      try {
        await associateProgrammeWithSchool(programmeId);
        successCount += 1;
        succeeded.add(programmeId);
      } catch (error) {
        if (!firstError) {
          firstError =
            error instanceof Error ? error.message : "Failed to add programme";
        }
      }
    }

    setAdding(false);
    await loadSchoolProgrammes();

    if (firstError) {
      setSelectedIds(
        new Set([...selectedIds].filter((id) => !succeeded.has(id)))
      );
      toast.error(
        successCount > 0
          ? `Added ${successCount}, but some failed: ${firstError}`
          : firstError
      );
      return;
    }

    toast.success(
      successCount === 1
        ? "Programme added successfully"
        : `${successCount} programmes added successfully`
    );
    setAddDialogOpen(false);
    resetAddDialog();
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
      await loadSchoolProgrammes();
      setDeleteDialogOpen(false);
      setProgrammeToDelete(null);
      setDeleteConfirmText("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove programme"
      );
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
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={isSchoolAdmin ? "Manage Programmes" : "View Programmes"}
        subtitle={
          isSchoolAdmin
            ? "Choose which programmes your school offers for candidate registration"
            : "Programmes available for registration at your school"
        }
        actions={
          isSchoolAdmin ? (
            <Button
              onClick={() => {
                resetAddDialog();
                setAddDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add programmes
            </Button>
          ) : undefined
        }
      />

      <StatStrip items={programmeKpis} />

      <section>
        <SectionLabel>Programmes</SectionLabel>
        <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by code, name, or type…"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={listTypeId != null ? String(listTypeId) : "all"}
              onValueChange={(value) =>
                setListTypeId(value === "all" ? null : parseInt(value, 10))
              }
              disabled={loading}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {listTypeOptions.map((type) => (
                  <SelectItem key={type.id} value={String(type.id)}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading programmes…
            </div>
          ) : schoolProgrammes.length === 0 ? (
            <div className="space-y-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No programmes added yet. Add programmes so candidates can register
                for examinations.
              </p>
              {isSchoolAdmin && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetAddDialog();
                    setAddDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add programmes
                </Button>
              )}
            </div>
          ) : filteredSchoolProgrammes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No programmes match your search or type filter.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Programme type</TableHead>
                    {isSchoolAdmin && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchoolProgrammes.map((programme) => (
                    <TableRow key={programme.id}>
                      <TableCell
                        className="cursor-pointer font-mono font-medium hover:underline"
                        onClick={() =>
                          router.push(`/dashboard/programmes/${programme.id}`)
                        }
                      >
                        {programme.code}
                      </TableCell>
                      <TableCell
                        className="cursor-pointer hover:underline"
                        onClick={() =>
                          router.push(`/dashboard/programmes/${programme.id}`)
                        }
                      >
                        {programme.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {programme.programme_type_name || "—"}
                      </TableCell>
                      {isSchoolAdmin && (
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
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && schoolProgrammes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Showing {filteredSchoolProgrammes.length} of{" "}
              {schoolProgrammes.length} programmes
            </p>
          )}
        </div>
      </section>

      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) resetAddDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add programmes to school</DialogTitle>
            <DialogDescription>
              Search and filter the catalog, then select one or more programmes to
              offer for registration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by code, name, or type…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="pl-10"
                  disabled={adding}
                />
              </div>
              <Select
                value={addTypeId != null ? String(addTypeId) : "all"}
                onValueChange={(value) =>
                  setAddTypeId(value === "all" ? null : parseInt(value, 10))
                }
                disabled={adding}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {catalogTypeOptions.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Label>
                Catalog ({selectedIds.size} selected,{" "}
                {filteredAvailableForAdd.length} shown)
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectFiltered}
                  disabled={adding || filteredAvailableForAdd.length === 0}
                >
                  Select filtered
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFiltered}
                  disabled={adding || selectedIds.size === 0}
                >
                  Clear filtered
                </Button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {availableForAdd.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  All catalog programmes are already linked to your school.
                </p>
              ) : filteredAvailableForAdd.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No programmes match your search or type filter.
                </p>
              ) : (
                filteredAvailableForAdd.map((programme) => (
                  <label
                    key={programme.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={selectedIds.has(programme.id)}
                      onCheckedChange={() => toggleSelected(programme.id)}
                      disabled={adding}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-sm font-medium">
                        {programme.code}
                      </span>
                      <span className="ml-2 text-sm">{programme.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {programme.programme_type_name || "Unassigned type"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddProgrammes}
              disabled={adding || selectedIds.size === 0}
            >
              {adding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {selectedIds.size <= 1
                ? "Add programme"
                : `Add ${selectedIds.size} programmes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Remove Programme
            </DialogTitle>
            <DialogDescription>
              This will remove the programme from your school&apos;s list.
              Candidates will no longer be able to register for this programme.
            </DialogDescription>
          </DialogHeader>
          {programmeToDelete && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium">Programme to remove:</p>
                <p className="mt-1 font-mono text-sm">{programmeToDelete.code}</p>
                <p className="mt-1 text-sm">{programmeToDelete.name}</p>
                {programmeToDelete.programme_type_name && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {programmeToDelete.programme_type_name}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">
                  Type <span className="font-mono font-semibold">delete</span> to
                  confirm:
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
              disabled={
                deleting || deleteConfirmText.toLowerCase() !== "delete"
              }
            >
              {deleting ? "Removing..." : "Remove Programme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
