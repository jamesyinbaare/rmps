"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ExaminerGroupCreateModal } from "@/components/examiner-group-create-modal";
import { EXAMINERS_PANEL_CLASS } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import {
  createExaminerGroup,
  deleteExaminerGroup,
  listExaminationExaminers,
  listExaminerGroups,
  replaceExaminerGroupMembers,
  replaceExaminerGroupSourceRegions,
  type ExaminerGroupRow,
  type ExaminerRow,
} from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type Props = {
  examId: number | null;
  embedded?: boolean;
};

export function ExaminersGroupsPanel({ examId, embedded = false }: Props) {
  const [examiners, setExaminers] = useState<ExaminerRow[]>([]);
  const [examinerGroups, setExaminerGroups] = useState<ExaminerGroupRow[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [regionsEditorGroupId, setRegionsEditorGroupId] = useState<string | null>(null);
  const [regionsDraft, setRegionsDraft] = useState<Record<string, boolean>>({});
  const [membersEditorGroupId, setMembersEditorGroupId] = useState<string | null>(null);
  const [membersDraft, setMembersDraft] = useState<Record<string, boolean>>({});

  const regionOptions = useMemo(
    () => REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    [],
  );

  const loadData = useCallback(async (eid: number) => {
    setGroupError(null);
    try {
      const [list, groups] = await Promise.all([
        listExaminationExaminers(eid),
        listExaminerGroups(eid),
      ]);
      setExaminers(list);
      setExaminerGroups(groups);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Failed to load groups");
      setExaminers([]);
      setExaminerGroups([]);
    }
  }, []);

  useEffect(() => {
    if (examId == null) {
      setExaminers([]);
      setExaminerGroups([]);
      return;
    }
    void loadData(examId);
  }, [examId, loadData]);

  function openRegionsEditor(groupId: string) {
    const g = examinerGroups.find((x) => x.id === groupId);
    if (!g) return;
    const d: Record<string, boolean> = {};
    for (const r of REGION_OPTIONS) {
      d[r.value] = g.source_regions.includes(r.value);
    }
    setRegionsDraft(d);
    setRegionsEditorGroupId(groupId);
  }

  async function saveRegionsEditor() {
    if (examId == null || !regionsEditorGroupId) return;
    const regs = Object.entries(regionsDraft)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setGroupBusy(true);
    setGroupError(null);
    try {
      await replaceExaminerGroupSourceRegions(examId, regionsEditorGroupId, regs);
      setRegionsEditorGroupId(null);
      await loadData(examId);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Save regions failed");
    } finally {
      setGroupBusy(false);
    }
  }

  function openMembersEditor(groupId: string) {
    const g = examinerGroups.find((x) => x.id === groupId);
    if (!g) return;
    const d: Record<string, boolean> = {};
    for (const ex of examiners) {
      d[ex.id] = g.examiner_ids.includes(ex.id);
    }
    setMembersDraft(d);
    setMembersEditorGroupId(groupId);
  }

  async function saveMembersEditor() {
    if (examId == null || !membersEditorGroupId) return;
    const ids = Object.entries(membersDraft)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setGroupBusy(true);
    setGroupError(null);
    try {
      await replaceExaminerGroupMembers(examId, membersEditorGroupId, ids);
      setMembersEditorGroupId(null);
      await loadData(examId);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Save members failed");
    } finally {
      setGroupBusy(false);
    }
  }

  async function handleDeleteGroup(groupId: string, name: string) {
    if (examId == null) return;
    if (!window.confirm(`Delete group "${name}"?`)) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      await deleteExaminerGroup(examId, groupId);
      await loadData(examId);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setGroupBusy(false);
    }
  }

  return (
    <>
      <section className={cn(embedded ? "space-y-3 p-2 sm:p-3" : EXAMINERS_PANEL_CLASS, !embedded && "space-y-4 p-4 sm:p-5")}>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Marking groups</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each group is defined by examiner home regions. Examiners in those regions are added automatically when
            you save regions. Regions must not overlap between groups.
          </p>
        </div>
        {groupError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {groupError}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={groupBusy}
            onClick={() => {
              setGroupError(null);
              setCreateGroupModalOpen(true);
            }}
          >
            Create group…
          </Button>
        </div>
        {examinerGroups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Home regions</th>
                  <th className="py-2 pr-2">Members</th>
                  <th className="py-2 pr-2 font-mono text-xs">Id</th>
                  <th className="py-2"> </th>
                </tr>
              </thead>
              <tbody>
                {examinerGroups.map((g) => (
                  <tr key={g.id} className="border-b border-border/80 align-top">
                    <td className="py-2 pr-2 font-medium">{g.name}</td>
                    <td className="py-2 pr-2">{g.source_regions.length ? g.source_regions.join(", ") : "—"}</td>
                    <td className="py-2 pr-2">{g.examiner_ids.length}</td>
                    <td className="py-2 pr-2 font-mono text-[11px] text-muted-foreground">{g.id}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`text-sm text-primary underline-offset-2 hover:underline ${inputFocusRing}`}
                          disabled={groupBusy}
                          onClick={() => openRegionsEditor(g.id)}
                        >
                          Regions
                        </button>
                        <button
                          type="button"
                          className={`text-sm text-primary underline-offset-2 hover:underline ${inputFocusRing}`}
                          disabled={groupBusy}
                          onClick={() => openMembersEditor(g.id)}
                        >
                          Members
                        </button>
                        <button
                          type="button"
                          className={`text-sm text-destructive underline-offset-2 hover:underline ${inputFocusRing}`}
                          disabled={groupBusy}
                          onClick={() => void handleDeleteGroup(g.id, g.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No groups yet. Create one to assign examiners and script regions.</p>
        )}
      </section>

      <ExaminerGroupCreateModal
        open={createGroupModalOpen}
        onClose={() => {
          setCreateGroupModalOpen(false);
          setGroupError(null);
        }}
        busy={groupBusy}
        error={groupError}
        regionOptions={regionOptions}
        onCreate={async (name, sourceRegions) => {
          if (examId == null) return "No examination selected.";
          setGroupBusy(true);
          setGroupError(null);
          try {
            await createExaminerGroup(examId, { name, source_regions: sourceRegions });
            await loadData(examId);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Create group failed";
          } finally {
            setGroupBusy(false);
          }
        }}
      />

      {regionsEditorGroupId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => !groupBusy && setRegionsEditorGroupId(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">Cohort regions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Saving replaces group membership with all roster examiners whose home region is checked.
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {REGION_OPTIONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={regionsDraft[r.value] ?? false}
                    disabled={groupBusy}
                    onChange={(e) => setRegionsDraft((prev) => ({ ...prev, [r.value]: e.target.checked }))}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" disabled={groupBusy} onClick={() => setRegionsEditorGroupId(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={groupBusy} onClick={() => void saveRegionsEditor()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {membersEditorGroupId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => !groupBusy && setMembersEditorGroupId(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">Group members</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each examiner may belong to at most one group. Saving regions overwrites manual member changes.
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {examiners.map((ex) => (
                <label key={ex.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={membersDraft[ex.id] ?? false}
                    disabled={groupBusy}
                    onChange={(e) => setMembersDraft((prev) => ({ ...prev, [ex.id]: e.target.checked }))}
                  />
                  <span className="min-w-0 truncate">
                    {ex.name} <span className="text-muted-foreground">({ex.region})</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" disabled={groupBusy} onClick={() => setMembersEditorGroupId(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={groupBusy} onClick={() => void saveMembersEditor()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
