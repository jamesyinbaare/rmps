"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";

import { ExaminerRatesGroupMembers } from "@/components/examiner-rates/examiner-rates-group-members";
import {
  ExaminerRatesPaneHeader,
  ExaminerRatesPayRuleNote,
} from "@/components/examiner-rates/shared";
import type { AllowanceGroupRow } from "@/lib/api";
import {
  ROSTER_ALLOWANCE_ELIGIBILITY_KEYS,
  ROSTER_ALLOWANCE_ELIGIBILITY_LABELS,
} from "@/lib/examiner-rates-draft";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  examinationId: number;
  editing: boolean;
  saving: boolean;
  groupActionBusy: boolean;
  allowanceGroups: AllowanceGroupRow[];
  selectedGroup: AllowanceGroupRow | null;
  newGroupName: string;
  renameGroupName: string;
  onSelectGroup: (group: AllowanceGroupRow) => void;
  onNewGroupNameChange: (value: string) => void;
  onRenameGroupNameChange: (value: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleAllowance: (groupId: string, key: (typeof ROSTER_ALLOWANCE_ELIGIBILITY_KEYS)[number], enabled: boolean) => void;
  onMemberCountChange: (groupId: string, count: number) => void;
};

export function ExaminerRatesGroupsPanel({
  examinationId,
  editing,
  saving,
  groupActionBusy,
  allowanceGroups,
  selectedGroup,
  newGroupName,
  renameGroupName,
  onSelectGroup,
  onNewGroupNameChange,
  onRenameGroupNameChange,
  onCreate,
  onRename,
  onDelete,
  onToggleAllowance,
  onMemberCountChange,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Who qualifies"
        title="By allowance group"
        description="Gate allowances by group membership. Every examiner is always in General; custom groups are optional."
      />
      <div className="mb-4 space-y-3">
        <ExaminerRatesPayRuleNote />
        <p className="text-xs text-muted-foreground">
          Example: turn sitting off on General, create “Sitting eligible” with sitting on, then assign examiners
          to that group below. Membership saves immediately; eligibility checkboxes still use Save.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {allowanceGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelectGroup(group)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              selectedGroup?.id === group.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-foreground hover:bg-muted/40",
            )}
          >
            {group.name}
            {group.is_general ? " · built-in" : ` · ${group.member_count}`}
          </button>
        ))}
      </div>

      {editing ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
          <div className="min-w-[12rem] flex-1">
            <label className={formLabelClass} htmlFor="new-allowance-group">
              New custom group
            </label>
            <input
              id="new-allowance-group"
              className={formInputClass}
              value={newGroupName}
              disabled={groupActionBusy || saving}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              placeholder="e.g. Sitting eligible"
            />
          </div>
          <button
            type="button"
            className={officialAccountsBtnPrimary}
            disabled={groupActionBusy || saving || !newGroupName.trim()}
            onClick={onCreate}
          >
            <Plus className="size-4" />
            Create
          </button>
          {selectedGroup && !selectedGroup.is_general ? (
            <>
              <div className="min-w-[12rem] flex-1">
                <label className={formLabelClass} htmlFor="rename-allowance-group">
                  Rename selected
                </label>
                <input
                  id="rename-allowance-group"
                  className={formInputClass}
                  value={renameGroupName}
                  disabled={groupActionBusy || saving}
                  onChange={(e) => onRenameGroupNameChange(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                disabled={groupActionBusy || saving}
                onClick={onRename}
              >
                <Pencil className="size-3.5" />
                Rename
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10"
                disabled={groupActionBusy || saving}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {selectedGroup ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Group</th>
                  {ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => (
                    <th key={key} className="px-3 py-2 font-medium text-center">
                      {ROSTER_ALLOWANCE_ELIGIBILITY_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {selectedGroup.name}
                    {selectedGroup.is_general ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(all examiners)</span>
                    ) : null}
                  </td>
                  {ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => (
                    <td key={key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGroup.allowances[key])}
                        disabled={!editing || saving}
                        onChange={(e) => onToggleAllowance(selectedGroup.id, key, e.target.checked)}
                        aria-label={`${selectedGroup.name} ${ROSTER_ALLOWANCE_ELIGIBILITY_LABELS[key]}`}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <ExaminerRatesGroupMembers
            key={selectedGroup.id}
            examinationId={examinationId}
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            isGeneral={selectedGroup.is_general}
            onMemberCountChange={(count) => onMemberCountChange(selectedGroup.id, count)}
          />
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No allowance groups loaded.</p>
      )}
    </div>
  );
}
