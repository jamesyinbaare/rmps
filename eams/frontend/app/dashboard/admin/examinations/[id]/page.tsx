"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getExamination,
  listSubjectExaminers,
  createSubjectExaminer,
  updateSubjectExaminer,
  getSubjects,
} from "@/lib/api";
import type {
  ExaminationResponse,
  SubjectExaminerResponse,
  SubjectExaminerCreate,
  Subject,
  SubjectExaminerStatus,
  SubjectType,
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
import { ArrowLeft, ArrowDown, ArrowUp, ChevronsUpDown, Plus, Search } from "lucide-react";

const STATUS_OPTIONS: { value: SubjectExaminerStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "ALLOCATED", label: "Allocated" },
  { value: "CLOSED", label: "Closed" },
];

const EXAM_TYPE_LABELS: Record<string, string> = {
  CERTIFICATE_II: "Certificate II Examinations",
  ADVANCE: "Advance",
  TECHNICIAN_PART_I: "Technician Part I",
  TECHNICIAN_PART_II: "Technician Part II",
  TECHNICIAN_PART_III: "Technician Part III",
  DIPLOMA: "Diploma",
};

const EXAM_SERIES_LABELS: Record<string, string> = {
  MAY_JUNE: "MAY/JUNE",
  NOV_DEC: "NOV/DEC",
};

const SUBJECT_TYPE_OPTIONS: { value: SubjectType; label: string }[] = [
  { value: "CORE", label: "Core" },
  { value: "ELECTIVE", label: "Elective" },
  { value: "TECHNICAL_DRAWING_BUILDING_OPTION", label: "Technical Drawing (Building)" },
  { value: "TECHNICAL_DRAWING_MECHANICAL_OPTION", label: "Technical Drawing (Mechanical)" },
  { value: "PRACTICAL", label: "Practical" },
];

type SortKey = "subject" | "status" | "total_required" | "experience_ratio";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort?.key === sortKey;
  const dir = isActive ? currentSort.dir : null;
  return (
    <th className={`p-2 text-left font-medium ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1 font-medium hover:bg-muted/50"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {dir === "desc" ? (
          <ArrowDown className="h-4 w-4" />
        ) : dir === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </th>
  );
}

export default function ExaminationSubjectExaminersPage() {
  const params = useParams();
  const router = useRouter();
  const examinationId = params.id as string;
  const [examination, setExamination] = useState<ExaminationResponse | null>(null);
  const [subjectExaminers, setSubjectExaminers] = useState<SubjectExaminerResponse[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SubjectExaminerCreate>({
    subject_id: "",
    total_required: 10,
    experience_ratio: 0.5,
  });
  const [search, setSearch] = useState("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectType | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const loadExamination = async () => {
    try {
      const ex = await getExamination(examinationId);
      setExamination(ex);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load examination");
      router.push("/dashboard/admin/examinations");
    }
  };

  const loadSubjectExaminers = async () => {
    try {
      const list = await listSubjectExaminers(examinationId);
      setSubjectExaminers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load subject examiners");
      setSubjectExaminers([]);
    }
  };

  useEffect(() => {
    if (!examinationId) return;
    setLoading(true);
    Promise.all([loadExamination(), loadSubjectExaminers()])
      .finally(() => setLoading(false));
  }, [examinationId]);

  useEffect(() => {
    getSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const filteredAndSorted = useMemo(() => {
    let list = subjectExaminers;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((se) => {
        const subject = subjectMap.get(se.subject_id);
        if (!subject) return se.subject_id.toLowerCase().includes(q);
        return (
          subject.code.toLowerCase().includes(q) ||
          subject.name.toLowerCase().includes(q)
        );
      });
    }
    if (subjectTypeFilter) {
      list = list.filter((se) => {
        const subject = subjectMap.get(se.subject_id);
        return subject?.type === subjectTypeFilter;
      });
    }
    if (sort) {
      const key = sort.key;
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        if (key === "subject") {
          const subA = subjectMap.get(a.subject_id);
          const subB = subjectMap.get(b.subject_id);
          const codeA = subA?.code ?? a.subject_id;
          const codeB = subB?.code ?? b.subject_id;
          return dir * (codeA.localeCompare(codeB) || (subA?.name ?? "").localeCompare(subB?.name ?? ""));
        }
        if (key === "status") {
          return dir * (a.status.localeCompare(b.status));
        }
        if (key === "total_required") {
          return dir * (a.total_required - b.total_required);
        }
        if (key === "experience_ratio") {
          return dir * (a.experience_ratio - b.experience_ratio);
        }
        return 0;
      });
    }
    return list;
  }, [subjectExaminers, subjectMap, search, subjectTypeFilter, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" as SortDir };
      if (prev.dir === "asc") return { key, dir: "desc" as SortDir };
      return { key, dir: "asc" as SortDir };
    });
  };

  const handleFieldChange = (subjectExaminerId: string, field: "total_required" | "experience_ratio", value: number) => {
    setSubjectExaminers((prev) =>
      prev.map((se) => (se.id === subjectExaminerId ? { ...se, [field]: value } : se))
    );
  };

  const handleSaveRow = async (se: SubjectExaminerResponse) => {
    try {
      await updateSubjectExaminer(se.id, {
        total_required: se.total_required,
        experience_ratio: se.experience_ratio,
      });
      toast.success("Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
      loadSubjectExaminers();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject_id) {
      toast.error("Please select a subject");
      return;
    }
    setCreating(true);
    try {
      await createSubjectExaminer(examinationId, form);
      toast.success("Subject examiner created");
      setCreateOpen(false);
      setForm({ subject_id: "", total_required: 10, experience_ratio: 0.5 });
      loadSubjectExaminers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create subject examiner");
    } finally {
      setCreating(false);
    }
  };

  const examLabel = examination
    ? `${EXAM_TYPE_LABELS[examination.type] ?? examination.type}${examination.series ? ` ${EXAM_SERIES_LABELS[examination.series] ?? examination.series}` : ""} ${examination.year}`
    : "";

  if (loading && !examination) {
    return <p className="p-4 text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/admin/examinations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{examLabel}</h1>
          <p className="text-sm text-muted-foreground">
            Subject examiners
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add subject examiner
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subject examiners</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(subjectExaminers.length > 0 || search || subjectTypeFilter) && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by code or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={subjectTypeFilter || "all"}
                onValueChange={(v) => setSubjectTypeFilter(v === "all" ? "" : (v as SubjectType))}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Subject type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subject types</SelectItem>
                  {SUBJECT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {subjectExaminers.length === 0 ? (
            <p className="text-muted-foreground">No subject examiners yet. Add one to configure quotas and run invitations.</p>
          ) : filteredAndSorted.length === 0 ? (
            <p className="text-muted-foreground">No rows match your search or filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <SortableHeader
                      label="Subject (code)"
                      sortKey="subject"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Status"
                      sortKey="status"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Required"
                      sortKey="total_required"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Experience ratio"
                      sortKey="experience_ratio"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((se) => {
                    const subject = subjectMap.get(se.subject_id);
                    const subjectLabel = subject ? `${subject.code} – ${subject.name}` : se.subject_id;
                    return (
                      <tr key={se.id} className="border-b">
                        <td className="p-2 font-medium">
                          {subjectLabel}
                        </td>
                        <td className="p-2">
                          <Badge variant="secondary">{se.status}</Badge>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20"
                            value={se.total_required}
                            onChange={(e) =>
                              handleFieldChange(se.id, "total_required", parseInt(e.target.value, 10) || 0)
                            }
                            onBlur={() => handleSaveRow(se)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            className="h-8 w-20"
                            value={se.experience_ratio}
                            onChange={(e) =>
                              handleFieldChange(se.id, "experience_ratio", parseFloat(e.target.value) || 0)
                            }
                            onBlur={() => handleSaveRow(se)}
                          />
                        </td>
                        <td className="p-2">
                          <Button variant="link" size="sm" asChild>
                            <Link href={`/dashboard/admin/subject-examiners/${se.id}`}>
                              View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {subjectExaminers.length > 0 && filteredAndSorted.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Showing {filteredAndSorted.length} of {subjectExaminers.length} subject examiner
              {subjectExaminers.length !== 1 ? "s" : ""}
              {(search.trim() || subjectTypeFilter) ? " (filtered)" : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Add subject examiner</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={form.subject_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v }))}
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
