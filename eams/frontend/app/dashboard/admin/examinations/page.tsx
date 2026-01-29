"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listExaminations,
  createExamination,
} from "@/lib/api";
import type {
  ExaminationResponse,
  ExaminationCreate,
  ExamType,
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
import { toast } from "sonner";
import { Plus, Calendar } from "lucide-react";

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "CERTIFICATE_II", label: "Certificate II Examinations" },
  { value: "ADVANCE", label: "Advance" },
  { value: "TECHNICIAN_PART_I", label: "Technician Part I" },
  { value: "TECHNICIAN_PART_II", label: "Technician Part II" },
  { value: "TECHNICIAN_PART_III", label: "Technician Part III" },
  { value: "DIPLOMA", label: "Diploma" },
];

const EXAM_SERIES_OPTIONS = [
  { value: "", label: "None" },
  { value: "MAY_JUNE", label: "MAY/JUNE" },
  { value: "NOV_DEC", label: "NOV/DEC" },
];

export default function AdminExaminationsPage() {
  const [examinations, setExaminations] = useState<ExaminationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<ExamType | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ExaminationCreate>({
    type: "CERTIFICATE_II",
    series: null,
    year: new Date().getFullYear(),
    acceptance_deadline: null,
  });

  const loadExaminations = async () => {
    setLoading(true);
    try {
      const year = yearFilter ? parseInt(yearFilter, 10) : undefined;
      const data = await listExaminations({
        year: Number.isNaN(year as number) ? undefined : year,
        type_filter: typeFilter || undefined,
      });
      setExaminations(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load examinations");
      setExaminations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExaminations();
  }, [yearFilter, typeFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createExamination({
        type: form.type,
        series: form.series || undefined,
        year: form.year,
        acceptance_deadline: form.acceptance_deadline || undefined,
      });
      toast.success("Examination created");
      setCreateOpen(false);
      setForm({
        type: "CERTIFICATE_II",
        series: null,
        year: new Date().getFullYear(),
        acceptance_deadline: null,
      });
      loadExaminations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create examination");
    } finally {
      setCreating(false);
    }
  };

  const formatExamLabel = (ex: ExaminationResponse) => {
    const typeLabel = EXAM_TYPE_OPTIONS.find((o) => o.value === ex.type)?.label ?? ex.type;
    if (ex.series) {
      const seriesLabel = EXAM_SERIES_OPTIONS.find((o) => o.value === ex.series)?.label ?? ex.series;
      return `${typeLabel} ${seriesLabel} ${ex.year}`;
    }
    return `${typeLabel} ${ex.year}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Examinations</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create examination
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
            <Label>Type</Label>
            <Select
              value={typeFilter || "all"}
              onValueChange={(v) => setTypeFilter(v === "all" ? "" : (v as ExamType))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {EXAM_TYPE_OPTIONS.map((o) => (
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
            Examinations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : examinations.length === 0 ? (
            <p className="text-muted-foreground">No examinations found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">Examination</th>
                    <th className="p-2 text-left font-medium">Year</th>
                    <th className="p-2 text-left font-medium">Acceptance deadline</th>
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {examinations.map((ex) => (
                    <tr key={ex.id} className="border-b">
                      <td className="p-2">{formatExamLabel(ex)}</td>
                      <td className="p-2">{ex.year}</td>
                      <td className="p-2">
                        {ex.acceptance_deadline
                          ? new Date(ex.acceptance_deadline).toLocaleString()
                          : "—"}
                      </td>
                      <td className="p-2">
                        <Button variant="link" size="sm" asChild>
                          <Link href={`/dashboard/admin/examinations/${ex.id}`}>
                            Subject examiners
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
              <CardTitle>Create examination</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v as ExamType }))}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXAM_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Series (optional)</Label>
                  <Select
                    value={form.series ?? ""}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, series: v ? (v as "MAY_JUNE" | "NOV_DEC") : null }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXAM_SERIES_OPTIONS.map((o) => (
                        <SelectItem key={o.value || "none"} value={o.value || "none"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-year">Year</Label>
                  <Input
                    id="create-year"
                    type="number"
                    value={form.year}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || 0 }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-deadline">Acceptance deadline (optional)</Label>
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
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
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
