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
import { DatePicker } from "@/components/ui/date-picker";
import {
  createExam,
  getProgrammeTypeTree,
  listExamSeriesDefinitions,
  listRootProgrammeTypes,
} from "@/lib/api";
import { toast } from "sonner";
import type { ExamKind, ExamSeriesDefinition, ProgrammeType, ProgrammeTypeTreeNode, RegistrationExamCreate } from "@/types";
import {
  ProgrammeTypeEnablementTree,
  collectTreeIds,
  findRootSubtree,
} from "@/components/admin/ProgrammeTypeEnablementTree";

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateExamDialog({ open, onOpenChange, onSuccess }: CreateExamDialogProps) {
  const [roots, setRoots] = useState<ProgrammeType[]>([]);
  const [tree, setTree] = useState<ProgrammeTypeTreeNode[]>([]);
  const [seriesList, setSeriesList] = useState<ExamSeriesDefinition[]>([]);
  const [programmeTypeId, setProgrammeTypeId] = useState<string>("");
  const [examSeriesId, setExamSeriesId] = useState<string>("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [examKind, setExamKind] = useState<ExamKind>("school");
  const [allowsReferralRegistration, setAllowsReferralRegistration] = useState(true);
  const [requiresCompletionConfirmation, setRequiresCompletionConfirmation] = useState(false);
  const [registrationStartDate, setRegistrationStartDate] = useState<Date | null>(null);
  const [registrationEndDate, setRegistrationEndDate] = useState<Date | null>(null);
  const [allowsBulkRegistration, setAllowsBulkRegistration] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
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
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load exam options"))
      .finally(() => setLoadingMeta(false));
  }, [open]);

  const selectedRoot = useMemo(() => {
    const id = parseInt(programmeTypeId, 10);
    if (!id) return null;
    return findRootSubtree(tree, id);
  }, [tree, programmeTypeId]);

  const enablementNodes = useMemo(() => {
    if (!selectedRoot) return [];
    return [selectedRoot];
  }, [selectedRoot]);

  useEffect(() => {
    if (!selectedRoot) {
      setEnabledIds(new Set());
      return;
    }
    setEnabledIds(new Set(collectTreeIds([selectedRoot])));
  }, [selectedRoot?.id]);

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

    if (!programmeTypeId || !examSeriesId || !year || !registrationStartDate || !registrationEndDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (enabledIds.size === 0) {
      toast.error("Enable at least one programme type for registration");
      return;
    }

    const startDate = new Date(registrationStartDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(registrationEndDate);
    endDate.setHours(23, 59, 59, 999);

    if (endDate <= startDate) {
      toast.error("Registration end date must be after start date");
      return;
    }

    setLoading(true);
    try {
      const startDateTime = new Date(registrationStartDate);
      startDateTime.setHours(0, 0, 0, 0);
      const endDateTime = new Date(registrationEndDate);
      endDateTime.setHours(23, 59, 59, 999);

      const examData: RegistrationExamCreate = {
        programme_type_id: parseInt(programmeTypeId, 10),
        exam_series_id: parseInt(examSeriesId, 10),
        enabled_programme_type_ids: Array.from(enabledIds),
        year: parseInt(year, 10),
        description: description || null,
        exam_kind: examKind,
        allows_referral_registration: examKind === "school" ? allowsReferralRegistration : false,
        requires_completion_confirmation:
          examKind === "school" ? requiresCompletionConfirmation : false,
        registration_period: {
          registration_start_date: startDateTime.toISOString(),
          registration_end_date: endDateTime.toISOString(),
          allows_bulk_registration: allowsBulkRegistration,
        },
      };

      await createExam(examData);
      toast.success("Exam created successfully");
      onSuccess();
      onOpenChange(false);
      setProgrammeTypeId("");
      setExamSeriesId("");
      setYear("");
      setDescription("");
      setExamKind("school");
      setAllowsReferralRegistration(true);
      setRequiresCompletionConfirmation(false);
      setRegistrationStartDate(null);
      setRegistrationEndDate(null);
      setAllowsBulkRegistration(true);
      setEnabledIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create exam");
    } finally {
      setLoading(false);
    }
  };

  const hasHierarchy = (selectedRoot?.children?.length || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Examination</DialogTitle>
          <DialogDescription>
            Choose school or private examination kind, then bind programme type and series.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Examination kind *</Label>
              <div className="flex flex-wrap gap-4">
                <Label className="flex items-center gap-2 font-normal cursor-pointer">
                  <input
                    type="radio"
                    name="examKind"
                    checked={examKind === "school"}
                    onChange={() => setExamKind("school")}
                    disabled={loading}
                  />
                  School examination
                </Label>
                <Label className="flex items-center gap-2 font-normal cursor-pointer">
                  <input
                    type="radio"
                    name="examKind"
                    checked={examKind === "private"}
                    onChange={() => {
                      setExamKind("private");
                      setAllowsReferralRegistration(false);
                    }}
                    disabled={loading}
                  />
                  Private examination
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {examKind === "school"
                  ? "Schools register Free TVET and/or Fee-paying candidates; referral optional. Private portal closed."
                  : "Individuals and schools register private candidates only. No referral or free TVET."}
              </p>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="programmeType">Programme type *</Label>
                <Select
                  value={programmeTypeId}
                  onValueChange={setProgrammeTypeId}
                  disabled={loading || loadingMeta}
                  required
                >
                  <SelectTrigger id="programmeType">
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
                <Label htmlFor="examSeries">Series / sitting *</Label>
                <Select
                  value={examSeriesId}
                  onValueChange={setExamSeriesId}
                  disabled={loading || loadingMeta}
                  required
                >
                  <SelectTrigger id="examSeries">
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

            {hasHierarchy && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Enable programme types for registration *</Label>
                <p className="text-xs text-muted-foreground">
                  Turn off any sub programme type to hide its programmes and subjects for this sitting.
                </p>
                <ProgrammeTypeEnablementTree
                  nodes={enablementNodes}
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
                placeholder="2026"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                disabled={loading}
                min="2000"
                max="2100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DatePicker
                label="Registration Start Date *"
                value={registrationStartDate}
                onChange={setRegistrationStartDate}
                placeholder="Select start date"
                disabled={loading}
              />
              <DatePicker
                label="Registration End Date *"
                value={registrationEndDate}
                onChange={setRegistrationEndDate}
                placeholder="Select end date"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowsBulkRegistration}
                  onChange={(e) => setAllowsBulkRegistration(e.target.checked)}
                  disabled={loading}
                />
                Allow bulk registration (school portal)
              </Label>
            </div>
            {examKind === "school" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowsReferralRegistration}
                    onChange={(e) => setAllowsReferralRegistration(e.target.checked)}
                    disabled={loading}
                  />
                  Allow referral candidate registration
                </Label>
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={requiresCompletionConfirmation}
                    onChange={(e) => setRequiresCompletionConfirmation(e.target.checked)}
                    disabled={loading}
                  />
                  Require school completion confirmation
                </Label>
                <p className="text-xs text-muted-foreground">
                  Schools must download, sign, and upload a completion form to finalize registration.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingMeta}>
              {loading ? "Creating..." : "Create Exam"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
