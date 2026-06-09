"use client";

import { Button } from "@/components/ui/button";

type CohortWorkspaceFooterProps = {
  mode: "create" | "edit";
  entityLabel: string;
  selectedCount: number;
  busy?: boolean;
  error?: string | null;
  softWarning?: string | null;
  membershipDirty?: boolean;
  membershipSaveDisabled?: boolean;
  canSaveMembership?: boolean;
  deleteConfirmOpen?: boolean;
  onDeleteConfirmOpenChange?: (open: boolean) => void;
  onSaveMembership: () => void;
  onDelete?: () => void;
};

export function CohortWorkspaceFooter({
  mode,
  entityLabel,
  selectedCount,
  busy = false,
  error = null,
  softWarning = null,
  membershipDirty = false,
  membershipSaveDisabled = false,
  canSaveMembership = true,
  deleteConfirmOpen = false,
  onDeleteConfirmOpenChange,
  onSaveMembership,
  onDelete,
}: CohortWorkspaceFooterProps) {
  const saveLabel = "Save membership";
  const cannotSaveMembership =
    busy || !canSaveMembership || membershipSaveDisabled || !membershipDirty;

  return (
    <>
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
      {softWarning ? (
        <p className="mb-2 text-sm text-amber-800 dark:text-amber-300">{softWarning}</p>
      ) : null}
      {!canSaveMembership && mode === "create" ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Save details first to create this {entityLabel}, then you can save membership.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selectedCount}</span> examiner
          {selectedCount === 1 ? "" : "s"} in this {entityLabel}
          {membershipDirty ? (
            <span className="ml-1.5 text-amber-800 dark:text-amber-300">· unsaved</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {mode === "edit" && onDelete && onDeleteConfirmOpenChange ? (
            deleteConfirmOpen ? (
              <>
                <span className="self-center text-xs text-muted-foreground">
                  Delete this {entityLabel}?
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onDeleteConfirmOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={onDelete}
                >
                  Confirm delete
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => onDeleteConfirmOpenChange(true)}
              >
                Delete
              </Button>
            )
          ) : null}
          <Button type="button" size="sm" disabled={cannotSaveMembership} onClick={onSaveMembership}>
            {busy ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
