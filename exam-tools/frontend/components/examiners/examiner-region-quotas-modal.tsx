"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import { EXAMINER_TYPE_LABELS, EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import type { ExaminerTypeApi, Subject } from "@/lib/api";
import {
  getSubjectExaminerRegionQuotas,
  putSubjectExaminerRegionQuotas,
  type ExaminerQuotaRegionGroupRow,
  type SubjectExaminerRegionQuotaItem,
} from "@/lib/api";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { subjectDisplayLabel } from "@/lib/subject-display";

type Props = {
  open: boolean;
  examId: number | null;
  subjects: Subject[];
  onOpenChange: (open: boolean) => void;
};

type DraftCell = { total: string; roles: Record<ExaminerTypeApi, string> };

function emptyRoles(): Record<ExaminerTypeApi, string> {
  return {
    chief_examiner: "",
    assistant_chief_examiner: "",
    assistant_examiner: "",
    team_leader: "",
  };
}

export function ExaminerRegionQuotasModal({ open, examId, subjects, onOpenChange }: Props) {
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [groups, setGroups] = useState<ExaminerQuotaRegionGroupRow[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [summary, setSummary] = useState<Record<string, { total: number; roles: Record<string, number> }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b))),
    [subjects],
  );

  const load = useCallback(async () => {
    if (examId == null || subjectId == null) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await getSubjectExaminerRegionQuotas(examId, subjectId);
      setGroups(res.groups);
      const nextDraft: Record<string, DraftCell> = {};
      const nextSummary: Record<string, { total: number; roles: Record<string, number> }> = {};
      for (const g of res.groups) {
        nextDraft[g.id] = { total: "", roles: emptyRoles() };
        nextSummary[g.id] = { total: 0, roles: {} };
      }
      for (const item of res.items) {
        const cell = nextDraft[item.group_id] ?? { total: "", roles: emptyRoles() };
        if (item.examiner_type == null) {
          cell.total = String(item.quota_count);
        } else {
          cell.roles[item.examiner_type] = String(item.quota_count);
        }
        nextDraft[item.group_id] = cell;
      }
      for (const row of res.summary) {
        const s = nextSummary[row.group_id] ?? { total: 0, roles: {} };
        if (row.examiner_type == null) {
          s.total = row.current_count;
        } else {
          s.roles[row.examiner_type] = row.current_count;
        }
        nextSummary[row.group_id] = s;
      }
      setDraft(nextDraft);
      setSummary(nextSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotas");
    } finally {
      setLoading(false);
    }
  }, [examId, subjectId]);

  useEffect(() => {
    if (!open) return;
    if (subjectId == null && sortedSubjects.length > 0) {
      setSubjectId(sortedSubjects[0].id);
    }
  }, [open, sortedSubjects, subjectId]);

  useEffect(() => {
    if (open && examId != null && subjectId != null) void load();
  }, [open, examId, subjectId, load]);

  async function handleSave() {
    if (examId == null || subjectId == null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const items: SubjectExaminerRegionQuotaItem[] = [];
      for (const group of groups) {
        const cell = draft[group.id];
        if (!cell) continue;
        if (cell.total.trim() !== "") {
          items.push({
            group_id: group.id,
            examiner_type: null,
            quota_count: Number(cell.total),
          });
        }
        for (const opt of EXAMINER_TYPE_OPTIONS) {
          const val = cell.roles[opt.value]?.trim() ?? "";
          if (val !== "") {
            items.push({
              group_id: group.id,
              examiner_type: opt.value,
              quota_count: Number(val),
            });
          }
        }
      }
      await putSubjectExaminerRegionQuotas(examId, subjectId, {
        total_quota: null,
        items,
      });
      setMessage("Regional quotas saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save quotas");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <OfficialModal
      title="Regional quotas"
      subtitle="Set headcount caps per combined region group. Leave blank for no cap."
      titleId="examiner-region-quotas-title"
      subtitleId="examiner-region-quotas-subtitle"
      onRequestClose={() => onOpenChange(false)}
      formError={error}
      size="wide"
      footer={
        <div className={officialModalFooterClass()}>
          <Button type="button" variant="outline" className={officialAccountsBtnSecondary} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" className={officialAccountsBtnPrimary} disabled={saving || loading} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save quotas"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Subject</label>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={subjectId ?? ""}
            onChange={(e) => setSubjectId(Number(e.target.value))}
            disabled={loading || saving}
          >
            {sortedSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {subjectDisplayLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Region group</th>
                  <th className="px-3 py-2 text-left font-medium">Current total</th>
                  <th className="px-3 py-2 text-left font-medium">Total cap</th>
                  {EXAMINER_TYPE_OPTIONS.map((o) => (
                    <th key={o.value} className="px-3 py-2 text-left font-medium">
                      {EXAMINER_TYPE_LABELS[o.value]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const cell = draft[group.id] ?? { total: "", roles: emptyRoles() };
                  const sum = summary[group.id];
                  return (
                    <tr key={group.id} className="border-t border-border/60">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{group.name}</div>
                        <div className="text-xs text-muted-foreground">{group.regions.join(", ")}</div>
                      </td>
                      <td className="px-3 py-2 align-top">{sum?.total ?? 0}</td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min={0}
                          className="w-20 rounded border border-border px-2 py-1"
                          value={cell.total}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [group.id]: { ...cell, total: e.target.value },
                            }))
                          }
                        />
                      </td>
                      {EXAMINER_TYPE_OPTIONS.map((o) => (
                        <td key={o.value} className="px-3 py-2 align-top">
                          <div className="text-xs text-muted-foreground mb-1">
                            now {sum?.roles?.[o.value] ?? 0}
                          </div>
                          <input
                            type="number"
                            min={0}
                            className="w-20 rounded border border-border px-2 py-1"
                            value={cell.roles[o.value]}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [group.id]: {
                                  ...cell,
                                  roles: { ...cell.roles, [o.value]: e.target.value },
                                },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </div>
    </OfficialModal>
  );
}
