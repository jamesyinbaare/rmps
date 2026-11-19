"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  createProgrammeType,
  deleteProgrammeType,
  getProgrammeTypeTree,
  listProgrammeTypes,
} from "@/lib/api";
import type { ProgrammeType, ProgrammeTypeTreeNode } from "@/types";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

function TreeView({
  nodes,
  depth = 0,
  onDelete,
}: {
  nodes: ProgrammeTypeTreeNode[];
  depth?: number;
  onDelete: (id: number) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.id} style={{ marginLeft: depth * 16 }}>
          <div className="flex items-center justify-between gap-2 rounded border px-3 py-2">
            <div>
              <div className="font-medium">{n.name}</div>
              <div className="text-xs text-muted-foreground">
                {n.code}
                {!n.is_active ? " · inactive" : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onDelete(n.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {n.children?.length > 0 && (
            <div className="mt-1">
              <TreeView nodes={n.children} depth={depth + 1} onDelete={onDelete} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ProgrammeTypesSectionProps {
  showAddButton?: boolean;
  onRequestAdd?: () => void;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}

export function ProgrammeTypesSection({
  showAddButton = true,
  addOpen: controlledAddOpen,
  onAddOpenChange,
}: ProgrammeTypesSectionProps = {}) {
  const [tree, setTree] = useState<ProgrammeTypeTreeNode[]>([]);
  const [flat, setFlat] = useState<ProgrammeType[]>([]);
  const [internalOpen, setInternalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [loading, setLoading] = useState(false);

  const open = controlledAddOpen ?? internalOpen;
  const setOpen = onAddOpenChange ?? setInternalOpen;

  const load = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([getProgrammeTypeTree(false), listProgrammeTypes(false)]);
      setTree(t);
      setFlat(f);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load programme types");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setLoading(true);
    try {
      await createProgrammeType({
        code: code.trim(),
        name: name.trim(),
        parent_id: parentId === "none" ? null : parseInt(parentId, 10),
      });
      toast.success("Programme type created");
      setOpen(false);
      setCode("");
      setName("");
      setParentId("none");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProgrammeType(id);
      toast.success("Programme type deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      {showAddButton && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add type
          </Button>
        </div>
      )}

      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">No programme types defined yet.</p>
      ) : (
        <TreeView nodes={tree} onDelete={handleDelete} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add programme type</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TECH_PART_IV" />
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Technicians Part IV"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="None (root)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (root)</SelectItem>
                  {flat.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} ({t.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
