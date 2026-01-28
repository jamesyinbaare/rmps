"use client";

import { useEffect, useState } from "react";
import {
  listAdminSubjects,
  createSubject,
  getSubjectTypes,
} from "@/lib/api";
import type { Subject, SubjectCreate, SubjectType } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, BookOpen, Upload } from "lucide-react";
import { BulkUploadSubjectsDialog } from "@/components/admin/BulkUploadSubjectsDialog";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjectTypes, setSubjectTypes] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState<SubjectCreate>({
    code: "",
    name: "",
    type: null,
    description: null,
  });

  const load = () => {
    setLoading(true);
    listAdminSubjects()
      .then(setSubjects)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load subjects");
        setSubjects([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    getSubjectTypes()
      .then(setSubjectTypes)
      .catch(() => setSubjectTypes([]));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      await createSubject({
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type || undefined,
        description: form.description?.trim() || undefined,
      });
      toast.success("Subject created");
      setAddOpen(false);
      setForm({ code: "", name: "", type: null, description: null });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create subject");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Subjects</h1>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add subject
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk upload
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Subject list
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : subjects.length === 0 ? (
            <p className="text-muted-foreground">No subjects. Add one or bulk upload.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">Code</th>
                    <th className="p-2 text-left font-medium">Name</th>
                    <th className="p-2 text-left font-medium">Type</th>
                    <th className="p-2 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="p-2 font-medium">{s.code}</td>
                      <td className="p-2">{s.name}</td>
                      <td className="p-2">{s.type ?? "—"}</td>
                      <td className="p-2 text-muted-foreground max-w-xs truncate">
                        {s.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Add subject</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddOpen(false)}
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value }))
                    }
                    placeholder="e.g. 301"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="e.g. Mathematics"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type (optional)</Label>
                  <Select
                    value={form.type ?? "none"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        type: v === "none" ? null : (v as SubjectType),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {subjectTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={form.description ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <BulkUploadSubjectsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSuccess={load}
      />
    </div>
  );
}
