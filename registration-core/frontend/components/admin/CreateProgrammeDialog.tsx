"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createProgramme, getProgrammeTypeTree } from "@/lib/api";
import { toast } from "sonner";
import type { ProgrammeTypeTreeNode } from "@/types";

interface CreateProgrammeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function flattenTree(nodes: ProgrammeTypeTreeNode[], acc: { id: number; path: string }[] = []) {
  for (const n of nodes) {
    acc.push({ id: n.id, path: n.path || n.name });
    if (n.children?.length) flattenTree(n.children, acc);
  }
  return acc;
}

export function CreateProgrammeDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateProgrammeDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [programmeTypeId, setProgrammeTypeId] = useState("");
  const [tree, setTree] = useState<ProgrammeTypeTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    getProgrammeTypeTree(true)
      .then(setTree)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load programme types"));
  }, [open]);

  const options = useMemo(() => flattenTree(tree), [tree]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error("Programme code is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Programme name is required");
      return;
    }
    if (!programmeTypeId) {
      toast.error("Programme type is required");
      return;
    }

    setLoading(true);
    try {
      await createProgramme({
        code: code.trim(),
        name: name.trim(),
        programme_type_id: parseInt(programmeTypeId, 10),
      });
      toast.success("Programme created successfully");
      onSuccess();
      onOpenChange(false);
      setCode("");
      setName("");
      setProgrammeTypeId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create programme");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Programme</DialogTitle>
          <DialogDescription>Add a new programme and associate it with a programme type.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Programme Code</Label>
              <Input
                id="code"
                placeholder="PROG01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Programme Name</Label>
              <Input
                id="name"
                placeholder="Programme Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Programme type *</Label>
              <Select value={programmeTypeId} onValueChange={setProgrammeTypeId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select programme type" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
