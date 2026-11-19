"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  createLateRegistrationWindow,
  getExamEligibleSchools,
} from "@/lib/api";
import type { School } from "@/types";

interface OpenLateRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: number;
  onSuccess: () => void;
}

type Scope = "all" | "selected";

export function OpenLateRegistrationDialog({
  open,
  onOpenChange,
  examId,
  onSuccess,
}: OpenLateRegistrationDialogProps) {
  const [scope, setScope] = React.useState<Scope>("all");
  const [startsAt, setStartsAt] = React.useState<Date | null>(null);
  const [endsAt, setEndsAt] = React.useState<Date | null>(null);
  const [note, setNote] = React.useState("");
  const [schools, setSchools] = React.useState<School[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [search, setSearch] = React.useState("");
  const [loadingSchools, setLoadingSchools] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 3);
    end.setHours(23, 59, 59, 999);
    setScope("all");
    setStartsAt(now);
    setEndsAt(end);
    setNote("");
    setSelectedIds(new Set());
    setSearch("");

    setLoadingSchools(true);
    getExamEligibleSchools(examId)
      .then(setSchools)
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load eligible schools");
        setSchools([]);
      })
      .finally(() => setLoadingSchools(false));
  }, [open, examId]);

  const filteredSchools = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [schools, search]);

  const toggleSchool = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of filteredSchools) next.add(s.id);
      return next;
    });
  };

  const clearFiltered = () => {
    const filtered = new Set(filteredSchools.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (!filtered.has(id)) next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startsAt || !endsAt) {
      toast.error("Please set start and end dates");
      return;
    }
    if (endsAt <= startsAt) {
      toast.error("End date must be after start date");
      return;
    }
    if (scope === "selected" && selectedIds.size === 0) {
      toast.error("Select at least one school, or choose all eligible schools");
      return;
    }
    if (schools.length === 0) {
      toast.error("No eligible schools configured for this examination");
      return;
    }

    setSaving(true);
    try {
      await createLateRegistrationWindow(examId, {
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        school_ids: scope === "all" ? [] : Array.from(selectedIds),
        note: note.trim() || null,
      });
      toast.success(
        scope === "all"
          ? "Late registration opened for all eligible schools"
          : `Late registration opened for ${selectedIds.size} school${selectedIds.size === 1 ? "" : "s"}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open late registration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <DialogTitle>Open late registration</DialogTitle>
          <DialogDescription>
            Grant a temporary registration window without changing the main period end date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-3">
              <Label>Scope</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as Scope)}
                className="gap-3"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted/30">
                  <RadioGroupItem value="all" id="scope-all" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">All eligible schools</span>
                    <span className="text-xs text-muted-foreground">
                      Every school currently on the eligibility list
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted/30">
                  <RadioGroupItem value="selected" id="scope-selected" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Selected schools</span>
                    <span className="text-xs text-muted-foreground">
                      Only the schools you pick below
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Starts *</Label>
                <DateTimePicker
                  value={startsAt}
                  onChange={setStartsAt}
                  placeholder="Start date and time"
                />
              </div>
              <div className="space-y-2">
                <Label>Ends *</Label>
                <DateTimePicker
                  value={endsAt}
                  onChange={setEndsAt}
                  placeholder="End date and time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="late-note">Note (optional)</Label>
              <Input
                id="late-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Late fees waiver for Region A"
                maxLength={1000}
              />
            </div>

            {scope === "selected" ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label>Schools ({selectedIds.size} selected)</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                      Select filtered
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearFiltered}>
                      Clear filtered
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder="Search code or name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {loadingSchools ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading schools…</p>
                  ) : filteredSchools.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      {schools.length === 0
                        ? "No eligible schools. Configure eligibility first."
                        : "No schools match your search."}
                    </p>
                  ) : (
                    filteredSchools.map((school) => (
                      <label
                        key={school.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selectedIds.has(school.id)}
                          onCheckedChange={() => toggleSchool(school.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-medium">{school.code}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{school.name}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Opening…" : "Open late registration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
