"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listCycles,
  createCycle,
  getSubjects,
} from "@/lib/api";
import type {
  MarkingCycleResponse,
  MarkingCycleCreate,
  MarkingCycleStatus,
  Subject,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Calendar } from "lucide-react";

const STATUS_OPTIONS: { value: MarkingCycleStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "ALLOCATED", label: "Allocated" },
  { value: "CLOSED", label: "Closed" },
];

export default function AdminCyclesPage() {
  const [cycles, setCycles] = useState<MarkingCycleResponse[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<MarkingCycleStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MarkingCycleCreate>({
    year: new Date().getFullYear(),
    subject_id: "",
    total_required: 10,
    experience_ratio: 0.5,
    acceptance_deadline: null,
  });

  const loadCycles = async () => {
    setLoading(true);
    try {
      const year = yearFilter ? parseInt(yearFilter, 10) : undefined;
      const status = statusFilter || undefined;
      const data = await listCycles(
        Number.isNaN(year) ? undefined : year,
        status || undefined
      );
      setCycles(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load cycles");
      setCycles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCycles();
  }, [yearFilter, statusFilter]);

  useEffect(() => {
    getSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject_id) {
      toast.error("Please select a subject");
      return;
    }
    setCreating(true);
    try {
      await createCycle({
        ...form,
        subject_id: form.subject_id,
        acceptance_deadline: form.acceptance_deadline || undefined,
      });
      toast.success("Cycle created");
      setCreateOpen(false);
      setForm({
        year: new Date().getFullYear(),
        subject_id: "",
        total_required: 10,
        experience_ratio: 0.5,
        acceptance_deadline: null,
      });
      loadCycles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create cycle");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Marking Cycles</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create cycle
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              placeholder="e.g. 2025"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) =>
                setStatusFilter(v === "all" ? "" : (v as MarkingCycleStatus))
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Cycles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : cycles.length === 0 ? (
            <p className="text-muted-foreground">No cycles found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">Year</th>
                    <th className="p-2 text-left font-medium">Subject</th>
                    <th className="p-2 text-left font-medium">Status</th>
                    <th className="p-2 text-left font-medium">Required</th>
                    <th className="p-2 text-left font-medium">Experience ratio</th>
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="p-2">{c.year}</td>
                      <td className="p-2">
                        {subjectMap.get(c.subject_id)?.name ?? c.subject_id}
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{c.status}</Badge>
                      </td>
                      <td className="p-2">{c.total_required}</td>
                      <td className="p-2">{c.experience_ratio}</td>
                      <td className="p-2">
                        <Button variant="link" size="sm" asChild>
                          <Link href={`/dashboard/admin/cycles/${c.id}`}>
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Create marking cycle</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-year">Year</Label>
                  <Input
                    id="create-year"
                    type="number"
                    value={form.year}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        year: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={form.subject_id}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, subject_id: v }))
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} – {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-total">Total required</Label>
                  <Input
                    id="create-total"
                    type="number"
                    min={1}
                    value={form.total_required}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        total_required: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-ratio">Experience ratio (0–1)</Label>
                  <Input
                    id="create-ratio"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={form.experience_ratio}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        experience_ratio: parseFloat(e.target.value) || 0,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-deadline">
                    Acceptance deadline (optional)
                  </Label>
                  <Input
                    id="create-deadline"
                    type="datetime-local"
                    value={
                      form.acceptance_deadline
                        ? form.acceptance_deadline.slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        acceptance_deadline: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      }))
                    }
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
