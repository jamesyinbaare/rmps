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
import {
  getProgrammeTypeTree,
  listExamSeriesDefinitions,
  listRootProgrammeTypes,
  updateExam,
} from "@/lib/api";
import { toast } from "sonner";
import type { ExamSeriesDefinition, ProgrammeType, ProgrammeTypeTreeNode, RegistrationExam } from "@/types";
import {
  ProgrammeTypeEnablementTree,
  findRootSubtree,
} from "@/components/admin/ProgrammeTypeEnablementTree";

interface EditExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: RegistrationExam;
  onSuccess: () => void;
}

export function EditExamDialog({
  open,
  onOpenChange,
  exam,
  onSuccess,
}: EditExamDialogProps) {
  const [roots, setRoots] = useState<ProgrammeType[]>([]);
  const [tree, setTree] = useState<ProgrammeTypeTreeNode[]>([]);
  const [seriesList, setSeriesList] = useState<ExamSeriesDefinition[]>([]);
  const [programmeTypeId, setProgrammeTypeId] = useState("");
  const [examSeriesId, setExamSeriesId] = useState("");
  const [year, setYear] = useState("");
  const [allowsReferralRegistration, setAllowsReferralRegistration] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      listRootProgrammeTypes(),
      getProgrammeTypeTree(true),
      listExamSeriesDefinitions(true),
    ])
      .then(([r, t, s]) => {
        setRoots(r);
        setTree(t);
        setSeriesList(s);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load exam options"));
  }, [open]);

  useEffect(() => {
    if (open && exam) {
      setProgrammeTypeId(exam.programme_type_id ? String(exam.programme_type_id) : "");
      setExamSeriesId(exam.exam_series_id ? String(exam.exam_series_id) : "");
      setYear(exam.year.toString());
      setAllowsReferralRegistration(exam.allows_referral_registration ?? true);
      setEnabledIds(new Set(exam.enabled_programme_type_ids || []));
    }
  }, [open, exam]);

  const selectedRoot = useMemo(() => {
    const id = parseInt(programmeTypeId, 10);
    if (!id) return null;
    return findRootSubtree(tree, id);
  }, [tree, programmeTypeId]);

  const hasHierarchy = (selectedRoot?.children?.length || 0) > 0;
  const hasCandidates = (exam.candidate_count || 0) > 0;

  const handleToggle = (id: number, enabled: boolean) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!programmeTypeId || !examSeriesId || !year) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (enabledIds.size === 0) {
      toast.error("Enable at least one programme type for registration");
      return;
    }

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      toast.error("Year must be a valid number between 1900 and 2100");
      return;
    }

    setLoading(true);
    try {
      await updateExam(exam.id, {
        programme_type_id: parseInt(programmeTypeId, 10),
        exam_series_id: parseInt(examSeriesId, 10),
        year: yearNum,
        enabled_programme_type_ids: Array.from(enabledIds),
        allows_referral_registration:
          exam.exam_kind === "school" ? allowsReferralRegistration : false,
      });

      toast.success("Examination updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update examination");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Examination Details</DialogTitle>
          <DialogDescription>
            Update programme type, series, year, and registration options. Examination kind is locked after candidates register.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="rounded-md border px-3 py-2 text-sm">
              Examination kind:{" "}
              <span className="font-medium capitalize">{exam.exam_kind || "school"}</span>
              {hasCandidates && (
                <span className="ml-2 text-xs text-muted-foreground">(locked)</span>
              )}
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Programme type *</Label>
                <Select
                  value={programmeTypeId}
                  onValueChange={setProgrammeTypeId}
                  disabled={loading || hasCandidates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select programme type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roots.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Series / sitting *</Label>
                <Select
                  value={examSeriesId}
                  onValueChange={setExamSeriesId}
                  disabled={loading || hasCandidates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select series" />
                  </SelectTrigger>
                  <SelectContent>
                    {seriesList.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.short_name} — {s.long_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasHierarchy && selectedRoot && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Enabled programme types *</Label>
                <ProgrammeTypeEnablementTree
                  nodes={[selectedRoot]}
                  enabledIds={enabledIds}
                  onToggle={handleToggle}
                  disabled={loading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                disabled={loading || hasCandidates}
                min="1900"
                max="2100"
              />
            </div>
            {exam.exam_kind === "school" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-normal">
                  <input
                    type="checkbox"
                    checked={allowsReferralRegistration}
                    onChange={(e) => setAllowsReferralRegistration(e.target.checked)}
                    disabled={loading}
                  />
                  Allow referral candidate registration
                </Label>
              </div>
            )}
            {hasCandidates && (
              <p className="text-xs text-muted-foreground">
                Programme type, series, year, and kind are locked because candidates are already registered.
                Enablement can still be adjusted (types with candidates cannot be turned off).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
