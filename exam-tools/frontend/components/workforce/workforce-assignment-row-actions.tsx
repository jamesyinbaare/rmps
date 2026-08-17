"use client";

import { Loader2 } from "lucide-react";

import {
  WorkforceOverflowMenu,
  workforceMenuItemClass,
} from "@/components/workforce/workforce-overflow-menu";

type Props = {
  personName: string;
  canAssign?: boolean;
  assignLabel?: string;
  assignDisabled?: boolean;
  onAssign?: () => void;
  onView: () => void;
  canRegeneratePortal?: boolean;
  regenBusy?: boolean;
  onRegenerate?: () => void;
};

export function WorkforceAssignmentRowActions({
  personName,
  canAssign = false,
  assignLabel = "Assign",
  assignDisabled = false,
  onAssign,
  onView,
  canRegeneratePortal = false,
  regenBusy = false,
  onRegenerate,
}: Props) {
  return (
    <WorkforceOverflowMenu label="Actions" ariaLabel={`Actions for ${personName}`} disabled={regenBusy}>
      {(close) => (
        <>
          {canAssign ? (
            <button
              type="button"
              role="menuitem"
              className={workforceMenuItemClass}
              disabled={assignDisabled || regenBusy}
              onClick={() => {
                onAssign?.();
                close();
              }}
            >
              {assignLabel}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={workforceMenuItemClass}
            disabled={regenBusy}
            onClick={() => {
              onView();
              close();
            }}
          >
            View
          </button>
          {canRegeneratePortal ? (
            <button
              type="button"
              role="menuitem"
              className={workforceMenuItemClass}
              disabled={regenBusy}
              onClick={() => {
                onRegenerate?.();
                close();
              }}
            >
              {regenBusy ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Regenerating…
                </span>
              ) : (
                "New portal link"
              )}
            </button>
          ) : null}
        </>
      )}
    </WorkforceOverflowMenu>
  );
}
