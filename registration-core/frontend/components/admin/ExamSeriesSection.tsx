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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createExamSeriesDefinition,
  deleteExamSeriesDefinition,
  listExamSeriesDefinitions,
  updateExamSeriesDefinition,
} from "@/lib/api";
import type { ExamSeriesDefinition } from "@/types";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface ExamSeriesSectionProps {
  showAddButton?: boolean;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}

export function ExamSeriesSection({
  showAddButton = true,
  addOpen: controlledAddOpen,
  onAddOpenChange,
}: ExamSeriesSectionProps = {}) {
  const [items, setItems] = useState<ExamSeriesDefinition[]>([]);
  const [internalOpen, setInternalOpen] = useState(false);
  const [shortName, setShortName] = useState("");
  const [longName, setLongName] = useState("");
  const [loading, setLoading] = useState(false);

  const open = controlledAddOpen ?? internalOpen;
  const setOpen = onAddOpenChange ?? setInternalOpen;

  const load = useCallback(async () => {
    try {
      setItems(await listExamSeriesDefinitions(false));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load exam series");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortName.trim() || !longName.trim()) {
      toast.error("Short name and long name are required");
      return;
    }
    setLoading(true);
    try {
      await createExamSeriesDefinition({
        short_name: shortName.trim(),
        long_name: longName.trim(),
      });
      toast.success("Exam series created");
      setOpen(false);
      setShortName("");
      setLongName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (item: ExamSeriesDefinition) => {
    try {
      await updateExamSeriesDefinition(item.id, { is_active: !item.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteExamSeriesDefinition(id);
      toast.success("Exam series deleted");
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
            Add series
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Short name</TableHead>
              <TableHead>Long name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No series defined
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.short_name}</TableCell>
                  <TableCell>{item.long_name}</TableCell>
                  <TableCell>{item.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(item)}>
                      {item.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add exam series</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Short name *</Label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="MAY/JUNE"
              />
            </div>
            <div className="space-y-2">
              <Label>Long name *</Label>
              <Input
                value={longName}
                onChange={(e) => setLongName(e.target.value)}
                placeholder="May/June Examinations"
              />
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
