"use client";

import { CohortScriptsAllocationReleaseStatusBadge } from "@/components/cohorts/cohort-scripts-allocation-release-status-badge";
import type { ScriptsAllocationReleaseDraft } from "@/components/cohorts/cohort-scripts-allocation-release-utils";
import { formInputClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  draft: ScriptsAllocationReleaseDraft;
  onChange: (draft: ScriptsAllocationReleaseDraft) => void;
  disabled?: boolean;
  className?: string;
};

export function CohortScriptsAllocationReleaseFields({
  draft,
  onChange,
  disabled = false,
  className,
}: Props) {
  return (
    <div className={cn("space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3.5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Scripts allocation release</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            When enabled, examiners in this cohort can see their script assignments on the portal.
            Leave release time empty to publish immediately.
          </p>
        </div>
        <CohortScriptsAllocationReleaseStatusBadge
          enabled={draft.enabled}
          releaseAt={draft.releaseAt ? new Date(draft.releaseAt).toISOString() : null}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="size-4 rounded border-border"
          checked={draft.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
        />
        Enable release to examiners
      </label>

      {draft.enabled ? (
        <div className="space-y-1.5">
          <label htmlFor="cohort-scripts-release-at" className="text-xs font-medium text-muted-foreground">
            Release at (optional)
          </label>
          <input
            id="cohort-scripts-release-at"
            type="datetime-local"
            className={formInputClass}
            value={draft.releaseAt}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, releaseAt: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Scheduled release in your local timezone. Clear to release as soon as you save.
          </p>
        </div>
      ) : null}
    </div>
  );
}
