"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExaminerReferenceCodesRegenerateConfirmModal } from "@/components/examiners/examiner-reference-codes-regenerate-confirm-modal";
import { Button } from "@/components/ui/button";
import {
  generateExaminerReferenceCodes,
  getExaminationExaminerRegionGroups,
  putExaminationExaminerRegionGroups,
  regenerateExaminerReferenceCodes,
  type ExaminerRegionGroupRow,
  type ExaminationExaminerRegionGroupsResponse,
} from "@/lib/api";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type DraftGroup = {
  clientId: string;
  name: string;
  code_prefix: string;
  regions: string[];
};

type Props = {
  examId: number | null;
  onGroupsSaved?: (res: ExaminationExaminerRegionGroupsResponse) => void;
  onCodesUpdated?: () => void;
  hideHeader?: boolean;
};

function newGroupId(): string {
  return `new-${crypto.randomUUID()}`;
}

function toDraft(groups: ExaminerRegionGroupRow[]): DraftGroup[] {
  return groups.map((g) => ({
    clientId: g.id ?? newGroupId(),
    name: g.name,
    code_prefix: g.code_prefix,
    regions: [...g.regions],
  }));
}

function assignedRegionCount(groups: DraftGroup[]): number {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const region of group.regions) seen.add(region);
  }
  return seen.size;
}

function formatActionMessage(assigned: number, skipped: number, verb: string): string {
  const parts = [`${verb} ${assigned.toLocaleString()} code${assigned === 1 ? "" : "s"}`];
  if (skipped > 0) {
    parts.push(`skipped ${skipped.toLocaleString()} (unmapped region)`);
  }
  return parts.join("; ") + ".";
}

export function ExaminerRegionGroupsEditor({
  examId,
  onGroupsSaved,
  onCodesUpdated,
  hideHeader = false,
}: Props) {
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeActionBusy, setCodeActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [regionsComplete, setRegionsComplete] = useState(false);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [withCodeCount, setWithCodeCount] = useState(0);
  const [missingCodeCount, setMissingCodeCount] = useState(0);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);

  const assignedCount = useMemo(() => assignedRegionCount(groups), [groups]);
  const codesActionDisabled = saving || loading || codeActionBusy || examId == null || !regionsComplete;

  const applyStats = useCallback(
    (res: {
      roster_total: number;
      with_code_count: number;
      missing_code_count: number;
      regions_complete: boolean;
    }) => {
      setRosterTotal(res.roster_total);
      setWithCodeCount(res.with_code_count);
      setMissingCodeCount(res.missing_code_count);
      setRegionsComplete(res.regions_complete);
    },
    [],
  );

  const loadGroups = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await getExaminationExaminerRegionGroups(examId);
      setGroups(toDraft(res.groups));
      applyStats(res);
      onGroupsSaved?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load region groups");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [applyStats, examId, onGroupsSaved]);

  useEffect(() => {
    if (examId != null) void loadGroups();
  }, [examId, loadGroups]);

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      { clientId: newGroupId(), name: `Group ${prev.length + 1}`, code_prefix: "", regions: [] },
    ]);
  }

  function removeGroup(clientId: string) {
    setGroups((prev) => prev.filter((g) => g.clientId !== clientId));
  }

  function updateGroup(clientId: string, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g) => (g.clientId === clientId ? { ...g, ...patch } : g)));
  }

  function toggleRegion(clientId: string, region: string, checked: boolean) {
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

  async function handleSave() {
    if (examId == null) return;
    setSaving(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await putExaminationExaminerRegionGroups(examId, {
        groups: groups.map((g) => ({
          name: g.name.trim(),
          code_prefix: g.code_prefix.trim().toUpperCase(),
          regions: g.regions,
        })),
      });
      setGroups(toDraft(res.groups));
      applyStats(res);
      onGroupsSaved?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateMissing() {
    if (examId == null) return;
    setCodeActionBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await generateExaminerReferenceCodes(examId);
      const refreshed = await getExaminationExaminerRegionGroups(examId);
      applyStats(refreshed);
      setActionMessage(formatActionMessage(res.assigned_count, res.skipped_count, "Assigned"));
      onCodesUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setCodeActionBusy(false);
    }
  }

  async function handleRegenerateAll() {
    if (examId == null) return;
    setCodeActionBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await regenerateExaminerReferenceCodes(examId);
      const refreshed = await getExaminationExaminerRegionGroups(examId);
      applyStats(refreshed);
      setActionMessage(formatActionMessage(res.assigned_count, res.skipped_count, "Regenerated"));
      setRegenerateConfirmOpen(false);
      onCodesUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setCodeActionBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {hideHeader ? null : (
          <div>
            <h2 className="text-sm font-semibold text-foreground">Region groups</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create groups and assign each Ghana region to exactly one group. Each group has a code prefix for
              roster reference codes (e.g. MATH301-NAE1, ENGL302-STL1). Quota region groups are configured on the Regional quotas
              tab.
            </p>
          </div>
        )}

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {rosterTotal > 0 && !regionsComplete ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            This examination has {rosterTotal.toLocaleString()} roster examiner
            {rosterTotal === 1 ? "" : "s"} but region groups are incomplete. Assign all{" "}
            {REGION_OPTIONS.length} regions before generating codes or setting quotas.
          </p>
        ) : null}

        {actionMessage ? (
          <p
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground"
            role="status"
          >
            {actionMessage}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading region groups…
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-medium text-foreground">Roster reference codes</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {rosterTotal.toLocaleString()} on roster · {withCodeCount.toLocaleString()} coded ·{" "}
                {missingCodeCount.toLocaleString()} missing
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={codesActionDisabled || missingCodeCount === 0}
                  onClick={() => void handleGenerateMissing()}
                >
                  {codeActionBusy ? "Working…" : "Generate missing"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={codesActionDisabled || rosterTotal === 0}
                  onClick={() => setRegenerateConfirmOpen(true)}
                >
                  Regenerate all
                </Button>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {assignedCount}/{REGION_OPTIONS.length} regions assigned
              </span>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addGroup}>
                <Plus className="size-3.5" aria-hidden />
                Add group
              </Button>
            </div>

            {groups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No region groups yet. Click &ldquo;Add group&rdquo; to create your first group.
              </p>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <div key={group.clientId} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Group name
                        <input
                          type="text"
                          className="rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground"
                          value={group.name}
                          onChange={(e) => updateGroup(group.clientId, { name: e.target.value })}
                        />
                      </label>
                      <label className="flex w-24 flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Prefix
                        <input
                          type="text"
                          maxLength={2}
                          className="rounded-lg border border-input-border bg-background px-3 py-2 font-mono text-sm uppercase text-foreground"
                          value={group.code_prefix}
                          onChange={(e) =>
                            updateGroup(group.clientId, {
                              code_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                            })
                          }
                          placeholder="N"
                        />
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mt-5 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeGroup(group.clientId)}
                        aria-label={`Remove ${group.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {REGION_OPTIONS.map((region) => {
                        const checked = group.regions.includes(region.value);
                        return (
                          <label
                            key={region.value}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                              checked
                                ? "border-primary/30 bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground",
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

            <div className="flex justify-end">
              <Button
                type="button"
                className={officialAccountsBtnPrimary}
                disabled={saving || loading || codeActionBusy || examId == null || groups.length === 0}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save region groups"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {regenerateConfirmOpen ? (
        <ExaminerReferenceCodesRegenerateConfirmModal
          rosterTotal={rosterTotal}
          busy={codeActionBusy}
          onCancel={() => {
            if (!codeActionBusy) setRegenerateConfirmOpen(false);
          }}
          onConfirm={() => void handleRegenerateAll()}
        />
      ) : null}
    </>
  );
}
