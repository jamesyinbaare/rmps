"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getExaminationExaminerQuotaRegionGroups,
  putExaminationExaminerQuotaRegionGroups,
  type ExaminerQuotaRegionGroupRow,
  type ExaminationExaminerQuotaRegionGroupsResponse,
} from "@/lib/api";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type DraftGroup = {
  clientId: string;
  name: string;
  regions: string[];
};

type Props = {
  examId: number | null;
  onGroupsSaved?: (res: ExaminationExaminerQuotaRegionGroupsResponse) => void;
  hideHeader?: boolean;
};

function newGroupId(): string {
  return `new-${crypto.randomUUID()}`;
}

function isNewGroup(clientId: string): boolean {
  return clientId.startsWith("new-");
}

function toDraft(groups: ExaminerQuotaRegionGroupRow[]): DraftGroup[] {
  return groups.map((g) => ({
    clientId: g.id ?? newGroupId(),
    name: g.name,
    regions: [...g.regions],
  }));
}

function serializeGroups(groups: DraftGroup[]): string {
  return JSON.stringify(
    groups.map((g) => ({
      id: g.clientId,
      name: g.name.trim(),
      regions: [...g.regions].sort(),
    })),
  );
}

function assignedRegionCount(groups: DraftGroup[]): number {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const region of group.regions) seen.add(region);
  }
  return seen.size;
}

export function ExaminerQuotaRegionGroupsEditor({ examId, onGroupsSaved, hideHeader = false }: Props) {
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const savedSnapshotRef = useRef("");

  const assignedCount = useMemo(() => assignedRegionCount(groups), [groups]);
  const regionsComplete = assignedCount === REGION_OPTIONS.length;
  const dirty = groups.length > 0 && serializeGroups(groups) !== savedSnapshotRef.current;
  const regionProgress =
    REGION_OPTIONS.length > 0 ? Math.round((assignedCount / REGION_OPTIONS.length) * 100) : 0;

  const applyLoadedGroups = useCallback((draft: DraftGroup[]) => {
    setGroups(draft);
    savedSnapshotRef.current = serializeGroups(draft);
  }, []);

  const loadGroups = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await getExaminationExaminerQuotaRegionGroups(examId);
      const draft = toDraft(res.groups);
      applyLoadedGroups(draft);
      onGroupsSaved?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quota region groups");
      applyLoadedGroups([]);
    } finally {
      setLoading(false);
    }
  }, [applyLoadedGroups, examId, onGroupsSaved]);

  useEffect(() => {
    if (examId != null) void loadGroups();
  }, [examId, loadGroups]);

  function addGroup() {
    setSuccessMessage(null);
    setGroups((prev) => [
      ...prev,
      { clientId: newGroupId(), name: `Group ${prev.length + 1}`, regions: [] },
    ]);
  }

  function removeGroup(clientId: string) {
    setSuccessMessage(null);
    setGroups((prev) => prev.filter((g) => g.clientId !== clientId));
  }

  function updateGroup(clientId: string, patch: Partial<DraftGroup>) {
    setSuccessMessage(null);
    setGroups((prev) => prev.map((g) => (g.clientId === clientId ? { ...g, ...patch } : g)));
  }

  function toggleRegion(clientId: string, region: string, checked: boolean) {
    setSuccessMessage(null);
    setGroups((prev) =>
      prev.map((g) => {
        if (checked) {
          if (g.clientId === clientId) {
            return g.regions.includes(region) ? g : { ...g, regions: [...g.regions, region] };
          }
          return { ...g, regions: g.regions.filter((r) => r !== region) };
        }
        if (g.clientId === clientId) {
          return { ...g, regions: g.regions.filter((r) => r !== region) };
        }
        return g;
      }),
    );
  }

  function handleDiscard() {
    setError(null);
    setSuccessMessage(null);
    void loadGroups();
  }

  async function handleSave() {
    if (examId == null) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await putExaminationExaminerQuotaRegionGroups(examId, {
        groups: groups.map((g) => ({
          ...(!isNewGroup(g.clientId) ? { id: g.clientId } : {}),
          name: g.name.trim(),
          regions: g.regions,
        })),
      });
      const draft = toDraft(res.groups);
      applyLoadedGroups(draft);
      setSuccessMessage("Quota region groups saved.");
      onGroupsSaved?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {hideHeader ? null : (
        <div>
          <h2 className="text-sm font-semibold text-foreground">Quota region groups</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Group regions for roster headcount quotas. Independent of reference-code groups on the Roster tab.
            You can edit names and region assignments at any time.
          </p>
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading quota region groups…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">
                {assignedCount} of {REGION_OPTIONS.length} regions assigned
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  regionsComplete ? "text-emerald-700" : "text-muted-foreground",
                )}
              >
                {regionProgress}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  regionsComplete ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${regionProgress}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {groups.length} group{groups.length === 1 ? "" : "s"}
              {dirty ? " · unsaved changes" : ""}
            </p>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addGroup}>
              <Plus className="size-3.5" aria-hidden />
              Add group
            </Button>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No quota region groups yet. Click &ldquo;Add group&rdquo; to create your first group.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group, index) => (
                <div
                  key={group.clientId}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </div>
                    <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Group name
                      <input
                        type="text"
                        className="rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground"
                        value={group.name}
                        onChange={(e) => updateGroup(group.clientId, { name: e.target.value })}
                      />
                    </label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeGroup(group.clientId)}
                      aria-label={`Remove ${group.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
                    Regions ({group.regions.length})
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {REGION_OPTIONS.map((region) => {
                      const checked = group.regions.includes(region.value);
                      return (
                        <label
                          key={region.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                            checked
                              ? "border-primary/30 bg-primary/10 text-foreground"
                              : "border-border bg-background text-muted-foreground hover:border-primary/20",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border"
                            checked={checked}
                            onChange={(e) => toggleRegion(group.clientId, region.value, e.target.checked)}
                          />
                          {region.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {dirty
                ? "Save to apply edits. Removing a group clears its subject quota caps."
                : regionsComplete
                  ? "All regions assigned — you can still edit groups anytime."
                  : "Assign every region to exactly one group before setting subject quotas."}
            </p>
            <div className="flex flex-wrap gap-2">
              {dirty ? (
                <Button
                  type="button"
                  variant="outline"
                  className={officialAccountsBtnSecondary}
                  disabled={saving || loading}
                  onClick={handleDiscard}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                className={officialAccountsBtnPrimary}
                disabled={saving || loading || examId == null || groups.length === 0 || !dirty}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save groups"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function QuotaRegionGroupsSummary({
  groups,
  regionsComplete,
  onEdit,
}: {
  groups: ExaminerQuotaRegionGroupRow[];
  regionsComplete: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {groups.length === 0 ? (
          <span className="text-xs text-muted-foreground">No groups configured</span>
        ) : (
          groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground"
            >
              <span className="font-medium">{g.name}</span>
              <span className="text-muted-foreground">· {g.regions.length} regions</span>
            </span>
          ))
        )}
      </div>
      <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden />
        {regionsComplete ? "Edit groups" : "Configure"}
      </Button>
    </div>
  );
}
