"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { ExaminerGroupCreateModal } from "@/components/examiner-group-create-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExaminerGroupRow, ExaminerTypeApi, Subject } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";

const EXAMINER_TYPE_OPTIONS: { value: ExaminerTypeApi; label: string }[] = [
  { value: "chief_examiner", label: "Chief examiner" },
  { value: "assistant_examiner", label: "Assistant examiner" },
  { value: "team_leader", label: "Team leader" },
];

export type QuotaRowState = {
  rowKey: string;
  examiner_type: ExaminerTypeApi;
  subject_id: number;
  quota_booklets: string;
};

export type RuleRowState = { rowKey: string; markingGroupId: string; targetGroupIds: string[] };

const inputFocusRing = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type Props = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  sessionReady: boolean;
  subjects: Subject[];
  subjectOptions: { value: string; label: string }[];
  poolRowCount: number;
  onOpenImport: () => void;
  onOpenPool: () => void;
  quotaRows: QuotaRowState[];
  setQuotaRows: Dispatch<SetStateAction<QuotaRowState[]>>;
  quotaError: string | null;
  onSaveQuotas: () => void;
  onAddQuotaRow: () => void;
  examinerGroups: ExaminerGroupRow[];
  fairnessWeight: string;
  setFairnessWeight: (v: string) => void;
  enforceSingleSeries: boolean;
  setEnforceSingleSeries: (v: boolean) => void;
  excludeHomeScope: boolean;
  setExcludeHomeScope: (v: boolean) => void;
  solveMode: "monolithic" | "decomposed";
  setSolveMode: (v: "monolithic" | "decomposed") => void;
  solveOptionsError: string | null;
  solveRuleRows: RuleRowState[];
  setSolveRuleRows: Dispatch<SetStateAction<RuleRowState[]>>;
  ruleMarkingGroupsFullyAllocated: boolean;
  onAddRuleRow: () => void;
  onRemoveRuleRow: (rowKey: string) => void;
  onRemoveRuleTarget: (rowKey: string, targetGroupId: string) => void;
  onToggleRuleTarget: (rowKey: string, targetGroupId: string, checked: boolean) => void;
  onSaveSolverSettings: () => void;
  solverSettingsSavedMessage: string | null;
  examinationId: number | null;
  onCreateExaminerGroup: (name: string, sourceRegions: string[]) => Promise<string | null>;
  onRefreshExaminerGroups: () => Promise<void>;
};

export function AllocationSetupDialog({
  open,
  onClose,
  busy,
  sessionReady,
  subjects,
  subjectOptions,
  poolRowCount,
  onOpenImport,
  onOpenPool,
  quotaRows,
  setQuotaRows,
  quotaError,
  onSaveQuotas,
  onAddQuotaRow,
  examinerGroups,
  fairnessWeight,
  setFairnessWeight,
  enforceSingleSeries,
  setEnforceSingleSeries,
  excludeHomeScope,
  setExcludeHomeScope,
  solveMode,
  setSolveMode,
  solveOptionsError,
  solveRuleRows,
  setSolveRuleRows,
  ruleMarkingGroupsFullyAllocated,
  onAddRuleRow,
  onRemoveRuleRow,
  onRemoveRuleTarget,
  onToggleRuleTarget,
  onSaveSolverSettings,
  solverSettingsSavedMessage,
  examinationId,
  onCreateExaminerGroup,
  onRefreshExaminerGroups,
}: Props) {
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [groupPanelBusy, setGroupPanelBusy] = useState(false);
  const [groupPanelError, setGroupPanelError] = useState<string | null>(null);

  if (!open) return null;

  const subjectEmptyText = subjects.length ? "No match." : "No subjects loaded.";
  const groupOptions = examinerGroups.map((g) => ({ value: g.id, label: g.name }));
  const regionOptionsForCreate = REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="flex max-h-[min(94vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="allocation-setup-title"
        aria-describedby="allocation-setup-desc"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-4">
          <h2 id="allocation-setup-title" className="text-base font-semibold text-card-foreground">
            Configure allocation
          </h2>
          <p id="allocation-setup-desc" className="mt-1 text-xs text-muted-foreground">
            Manage the examiner pool for this campaign, set booklet quotas, and configure solver options and cross-marking
            between examiner groups. Define groups on the examiner roster page. Each marking group may appear only once as
            a row source.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
          <section className="space-y-3" aria-labelledby="setup-pool-heading">
            <h3 id="setup-pool-heading" className="text-sm font-semibold text-card-foreground">
              Allocation pool
            </h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {poolRowCount === 0
                  ? "No examiners in this pool yet."
                  : `${poolRowCount} examiner${poolRowCount === 1 ? "" : "s"} in this pool.`}
              </span>{" "}
              Import adds roster members who are already eligible for this subject.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy || poolRowCount === 0} onClick={onOpenPool}>
                Manage pool…
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={onOpenImport}>
                Import examiners…
              </Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-6" aria-labelledby="setup-quotas-heading">
            <h3 id="setup-quotas-heading" className="text-sm font-semibold text-card-foreground">
              Booklet quotas
            </h3>
            <p className="text-xs text-muted-foreground">
              Targets by examiner type and subject for the MILP (whole envelopes, deviation from quota). Saving replaces
              all rows for this allocation.
            </p>
            {quotaError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {quotaError}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 pr-2">Examiner type</th>
                    <th className="px-3 py-2.5 pr-2">Subject</th>
                    <th className="px-3 py-2.5 pr-2">Quota (booklets)</th>
                    <th className="px-3 py-2.5 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {quotaRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        No quota rows. Add a row to set targets by examiner type and subject.
                      </td>
                    </tr>
                  ) : (
                    quotaRows.map((r) => (
                      <tr key={r.rowKey} className="border-b border-border/80 align-top">
                        <td className="px-3 py-2.5">
                          <select
                            className={`${formInputClass} min-w-[160px]`}
                            value={r.examiner_type}
                            onChange={(e) => {
                              const v = e.target.value as ExaminerTypeApi;
                              setQuotaRows((prev) =>
                                prev.map((x) => (x.rowKey === r.rowKey ? { ...x, examiner_type: v } : x)),
                              );
                            }}
                          >
                            {EXAMINER_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="mt-1">
                            <SearchableCombobox
                              options={subjectOptions}
                              value={r.subject_id ? String(r.subject_id) : ""}
                              onChange={(v) => {
                                const sid = Number(v);
                                setQuotaRows((prev) =>
                                  prev.map((x) =>
                                    x.rowKey === r.rowKey ? { ...x, subject_id: Number.isFinite(sid) ? sid : 0 } : x,
                                  ),
                                );
                              }}
                              placeholder="Select subject"
                              searchPlaceholder="Search subject…"
                              widthClass="min-w-[200px] w-full max-w-[280px]"
                              showAllOption={false}
                              emptyText={subjectEmptyText}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            className={`${formInputClass} w-28`}
                            inputMode="numeric"
                            value={r.quota_booklets}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuotaRows((prev) =>
                                prev.map((x) => (x.rowKey === r.rowKey ? { ...x, quota_booklets: v } : x)),
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className={`text-sm text-destructive underline-offset-2 hover:underline ${inputFocusRing}`}
                            onClick={() => setQuotaRows((prev) => prev.filter((x) => x.rowKey !== r.rowKey))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy || !sessionReady} onClick={onAddQuotaRow}>
                Add quota row
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={onSaveQuotas}>
                Save quotas
              </Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-6" aria-labelledby="setup-solver-heading">
            <h3 id="setup-solver-heading" className="text-sm font-semibold text-card-foreground">
              Solver and cross-marking (examiner groups)
            </h3>
            <p className="text-xs text-muted-foreground">
              Each row: marking group (whose examiners receive scripts) may mark script cohorts from the listed groups.
              Create groups here (name + script regions) or on the examiner roster page; assign members on the roster.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || groupPanelBusy || examinationId == null}
                onClick={() => {
                  setGroupPanelError(null);
                  setCreateGroupModalOpen(true);
                }}
              >
                New examiner group…
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || groupPanelBusy || examinationId == null}
                onClick={() => {
                  void (async () => {
                    setGroupPanelError(null);
                    setGroupPanelBusy(true);
                    try {
                      await onRefreshExaminerGroups();
                    } catch (e) {
                      setGroupPanelError(e instanceof Error ? e.message : "Refresh failed");
                    } finally {
                      setGroupPanelBusy(false);
                    }
                  })();
                }}
              >
                Refresh list
              </Button>
            </div>
            <ExaminerGroupCreateModal
              open={createGroupModalOpen}
              onClose={() => {
                setCreateGroupModalOpen(false);
                setGroupPanelError(null);
              }}
              busy={busy || groupPanelBusy}
              error={groupPanelError}
              regionOptions={regionOptionsForCreate}
              zIndexClass="z-[100]"
              onCreate={async (name, sourceRegions) => {
                setGroupPanelError(null);
                return onCreateExaminerGroup(name, sourceRegions);
              }}
            />
            {groupPanelError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {groupPanelError}
              </p>
            ) : null}
            {examinerGroups.length < 2 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                Create at least two examiner groups with script regions and members before cross-marking rules are useful.
              </p>
            ) : null}
            {solveOptionsError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {solveOptionsError}
              </p>
            ) : null}
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <label className="space-y-1">
                <span className="font-medium text-foreground">Fairness weight</span>
                <input
                  className={`${formInputClass} h-9 min-w-32 w-full`}
                  type="number"
                  min="0"
                  step="0.05"
                  value={fairnessWeight}
                  onChange={(e) => setFairnessWeight(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={enforceSingleSeries}
                  onChange={(e) => setEnforceSingleSeries(e.target.checked)}
                  disabled={busy}
                />
                One series per examiner
              </label>
              <label className="flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={excludeHomeScope}
                  onChange={(e) => setExcludeHomeScope(e.target.checked)}
                  disabled={busy}
                />
                Also exclude examiner home region (stricter than cohort rule)
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="font-medium text-foreground">Solve strategy</span>
                <select
                  className={`${formInputClass} h-9 w-full max-w-xl`}
                  value={solveMode}
                  onChange={(e) => setSolveMode(e.target.value as "monolithic" | "decomposed")}
                  disabled={busy}
                  aria-describedby="solve-strategy-hint"
                >
                  <option value="monolithic">Single MILP — one combined solve over all examiners and envelopes</option>
                  <option value="decomposed">
                    Decomposed — sequential marking groups (table order, top first), series buckets by booklet ratio;
                    smaller MILPs with per-stage progress
                  </option>
                </select>
                <span id="solve-strategy-hint" className="block text-muted-foreground">
                  {solveMode === "decomposed" ? (
                    <>
                      Later marking groups only see envelopes still unassigned. Order follows the cross-marking table top
                      to bottom; put the most important marking group first.
                    </>
                  ) : (
                    <>
                      Best global fit to quotas in one pass. Use <strong>Decomposed</strong> for traceability or when the
                      single solve is too large or hard to interpret.
                    </>
                  )}
                </span>
              </label>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <div className="flex justify-end border-b border-border bg-muted/30 px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAddRuleRow}
                  disabled={busy || ruleMarkingGroupsFullyAllocated || examinerGroups.length === 0}
                  title={
                    ruleMarkingGroupsFullyAllocated
                      ? "Each marking group is already a row source"
                      : examinerGroups.length === 0
                        ? "Create examiner groups first"
                        : undefined
                  }
                >
                  Add mapping row
                </Button>
              </div>
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Marking group (examiners)</th>
                    <th className="px-3 py-2.5">Allowed script cohort groups</th>
                    <th className="px-3 py-2.5 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {solveRuleRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                        No mapping rules. The solver requires at least one marking group → script cohort mapping.
                      </td>
                    </tr>
                  ) : (
                    solveRuleRows.map((row) => {
                      const takenElsewhere = new Set(
                        solveRuleRows
                          .filter((x) => x.rowKey !== row.rowKey && x.markingGroupId.trim() !== "")
                          .map((x) => x.markingGroupId.trim()),
                      );
                      const sourceOptions = groupOptions.filter(
                        (o) => !takenElsewhere.has(o.value) || o.value === row.markingGroupId,
                      );
                      const sortedTargets = [...row.targetGroupIds].sort((a, b) => {
                        const na = groupOptions.find((g) => g.value === a)?.label ?? a;
                        const nb = groupOptions.find((g) => g.value === b)?.label ?? b;
                        return na.localeCompare(nb, undefined, { sensitivity: "base" });
                      });
                      return (
                        <tr key={row.rowKey} className="border-b border-border/80">
                          <td className="px-3 py-2.5 align-top">
                            <select
                              className={`${formInputClass} w-full min-w-[180px]`}
                              value={row.markingGroupId}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSolveRuleRows((prev) =>
                                  prev.map((x) => (x.rowKey === row.rowKey ? { ...x, markingGroupId: value } : x)),
                                );
                              }}
                            >
                              <option value="">Select marking group…</option>
                              {sourceOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <div className="space-y-2">
                              <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                                <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
                                  {groupOptions.map((o) => (
                                    <label
                                      key={o.value}
                                      className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                                    >
                                      <input
                                        type="checkbox"
                                        className="shrink-0 rounded border-border"
                                        checked={row.targetGroupIds.includes(o.value)}
                                        onChange={(e) => onToggleRuleTarget(row.rowKey, o.value, e.target.checked)}
                                      />
                                      <span className="min-w-0 truncate">{o.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              {sortedTargets.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {sortedTargets.map((target) => (
                                    <Badge key={target} variant="secondary" className="gap-1 pr-1">
                                      <span>{groupOptions.find((g) => g.value === target)?.label ?? target}</span>
                                      <button
                                        type="button"
                                        className="rounded px-1 text-xs hover:bg-muted"
                                        onClick={() => onRemoveRuleTarget(row.rowKey, target)}
                                        aria-label="Remove target"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No cohort groups selected.</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              className={`text-destructive underline-offset-2 hover:underline ${inputFocusRing}`}
                              disabled={busy}
                              onClick={() => onRemoveRuleRow(row.rowKey)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {solverSettingsSavedMessage ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100">
                {solverSettingsSavedMessage}
              </p>
            ) : null}
            <Button type="button" disabled={busy} onClick={onSaveSolverSettings}>
              Save solver settings
            </Button>
          </section>
        </div>

        <div className="flex justify-end border-t border-border bg-muted/20 px-4 py-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
