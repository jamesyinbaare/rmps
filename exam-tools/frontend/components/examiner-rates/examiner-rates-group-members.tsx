"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { ExaminerAllowanceGroupMembersModal } from "@/components/examiner-rates/examiner-allowance-group-members-modal";
import { EXAMINER_TYPE_ABBREVIATIONS } from "@/components/examiner-invitations/constants";
import {
  getExaminationAllowanceGroupMembers,
  putExaminationAllowanceGroupMembers,
  type AllowanceGroupMemberRow,
  type ExaminerTypeApi,
} from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

function sourceLabel(source: string): string {
  if (source === "special" || source === "payout_override") return "Special";
  if (source === "invitation") return "Invitation";
  return "Regular";
}

function roleAbbrev(type: string): string {
  return EXAMINER_TYPE_ABBREVIATIONS[type as ExaminerTypeApi] ?? type;
}

type MembersListProps = {
  examinationId: number;
  groupId: string;
  groupName: string;
  isGeneral: boolean;
  onMemberCountChange?: (count: number) => void;
};

export function ExaminerRatesGroupMembers({
  examinationId,
  groupId,
  groupName,
  isGeneral,
  onMemberCountChange,
}: MembersListProps) {
  const [members, setMembers] = useState<AllowanceGroupMemberRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const onMemberCountChangeRef = useRef(onMemberCountChange);
  onMemberCountChangeRef.current = onMemberCountChange;

  const loadMembers = useCallback(async () => {
    if (isGeneral) {
      setMembers([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await getExaminationAllowanceGroupMembers(examinationId, groupId);
      setMembers(data.members);
      onMemberCountChangeRef.current?.(data.members.length);
      setSelectedToRemove(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members.");
    } finally {
      setBusy(false);
    }
  }, [examinationId, groupId, isGeneral]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.reference_code ?? "").toLowerCase().includes(q) ||
        m.region.toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  async function persistIds(nextIds: string[]) {
    setMutating(true);
    setError(null);
    try {
      const data = await putExaminationAllowanceGroupMembers(examinationId, groupId, nextIds);
      setMembers(data.members ?? []);
      onMemberCountChangeRef.current?.((data.members ?? []).length);
      setSelectedToRemove(new Set());
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update members.");
    } finally {
      setMutating(false);
    }
  }

  async function handleRemoveSelected() {
    if (selectedToRemove.size === 0) return;
    const next = members.filter((m) => !selectedToRemove.has(m.id)).map((m) => m.id);
    await persistIds(next);
  }

  async function handleAddSelected(idsToAdd: string[]) {
    const merged = [...new Set([...members.map((m) => m.id), ...idsToAdd])];
    await persistIds(merged);
  }

  if (isGeneral) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
        Every examiner on this examination is always a member of <span className="font-medium text-foreground">General</span>.
        Membership here cannot be edited.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Members</h4>
          <p className="text-xs text-muted-foreground">
            {members.length} examiner{members.length === 1 ? "" : "s"} in {groupName}
          </p>
        </div>
        <button
          type="button"
          className={officialAccountsBtnPrimary}
          disabled={busy || mutating}
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-4" />
          Add examiners
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {busy ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading members…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                className={cn(formInputClass, "pl-9")}
                placeholder="Search members…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            {selectedToRemove.size > 0 ? (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                disabled={mutating}
                onClick={() => void handleRemoveSelected()}
              >
                <Trash2 className="size-3.5" />
                Remove selected ({selectedToRemove.size})
              </button>
            ) : null}
          </div>

          {filteredMembers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {members.length === 0
                ? "No examiners in this group yet. Add examiners to gate allowances for a subset of the roster."
                : "No members match this search."}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 text-left text-xs text-muted-foreground backdrop-blur-sm">
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all visible members"
                        checked={
                          filteredMembers.length > 0 &&
                          filteredMembers.every((m) => selectedToRemove.has(m.id))
                        }
                        onChange={(e) => {
                          setSelectedToRemove((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) filteredMembers.forEach((m) => next.add(m.id));
                            else filteredMembers.forEach((m) => next.delete(m.id));
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Region</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedToRemove.has(m.id)}
                          onChange={(e) => {
                            setSelectedToRemove((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(m.id);
                              else next.delete(m.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${m.name}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{m.name}</span>
                        {m.reference_code ? (
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                            {m.reference_code}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{roleAbbrev(m.examiner_type)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.region}</td>
                      <td className="px-3 py-2 text-muted-foreground">{sourceLabel(m.roster_source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {pickerOpen ? (
        <ExaminerAllowanceGroupMembersModal
          examinationId={examinationId}
          groupName={groupName}
          existingMemberIds={new Set(members.map((m) => m.id))}
          busy={mutating}
          onClose={() => setPickerOpen(false)}
          onAdd={(ids) => void handleAddSelected(ids)}
        />
      ) : null}
    </div>
  );
}
