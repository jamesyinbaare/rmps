"use client";

import type { ClaimedRule, RuleOption } from "@/components/cohorts/types";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type Props = {
  options: RuleOption[];
  rolesDraft: Record<string, boolean>;
  claimedRoles: Map<string, ClaimedRule>;
  disabled?: boolean;
  onToggle: (role: string, checked: boolean) => void;
};

export function RoleRulePicker({
  options,
  rolesDraft,
  claimedRoles,
  disabled = false,
  onToggle,
}: Props) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">No examiners with role data.</p>;
  }

  return (
    <ul className="space-y-2">
      {options.map((r) => {
        const claimed = claimedRoles.get(r.value);
        const isClaimed = Boolean(claimed);
        const checked = rolesDraft[r.value] ?? false;
        return (
          <li key={r.value}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                isClaimed && "cursor-not-allowed opacity-60",
                checked && !isClaimed && "border-primary/30 bg-primary/5",
              )}
              title={isClaimed ? `Assigned to ${claimed!.cohortName}` : undefined}
            >
              <input
                type="checkbox"
                className={cn("mt-0.5 shrink-0", inputFocusRing)}
                checked={checked}
                disabled={disabled || isClaimed}
                aria-disabled={isClaimed}
                onChange={(e) => onToggle(r.value, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{r.label}</span>
                <span className="text-muted-foreground"> ({r.count})</span>
                {isClaimed ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Assigned to {claimed!.cohortName}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
