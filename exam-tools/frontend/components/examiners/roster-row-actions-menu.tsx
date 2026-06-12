"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";

import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import type { RosterTableRow } from "@/components/examiners/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  row: RosterTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  copyLinkState: "copied" | "error" | undefined;
  onEdit: (row: RosterTableRow) => void;
  onRemove: (row: RosterTableRow) => void;
  canEditRoster?: boolean;
  onCopyPortalLink: (row: RosterTableRow) => void;
  onViewAllocation?: (row: RosterTableRow) => void;
};

export function RosterRowActionsMenu({
  row,
  open,
  onOpenChange,
  busy,
  copyLinkState,
  onEdit,
  onRemove,
  canEditRoster = true,
  onCopyPortalLink,
  onViewAllocation,
}: Props) {
  const canViewAllocation = Boolean(onViewAllocation && row.subject_ids[0] != null);
  const canCopyLink = Boolean(row.portal_url);
  const hasMenuItems = canViewAllocation || canEditRoster || canCopyLink;

  if (!hasMenuItems) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const menuItemClass =
    "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
  const destructiveItemClass = cn(menuItemClass, "text-destructive hover:bg-destructive/10");

  return (
    <div className="flex flex-col items-end gap-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg border border-input-border bg-background px-2.5 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50",
              INPUT_FOCUS_RING,
            )}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`Actions for ${row.name}`}
          >
            Actions
            <ChevronDown className={cn("size-4 shrink-0 opacity-60", open && "rotate-180")} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="z-[250] w-auto min-w-[12rem] p-1" sideOffset={4}>
          <div role="menu" aria-label={`Actions for ${row.name}`}>
            {canViewAllocation ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                disabled={busy}
                onClick={() => {
                  onViewAllocation?.(row);
                  onOpenChange(false);
                }}
              >
                View allocation
              </button>
            ) : null}
            {canEditRoster ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                disabled={busy}
                onClick={() => {
                  onEdit(row);
                  onOpenChange(false);
                }}
              >
                Edit examiner
              </button>
            ) : null}
            {canCopyLink ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                disabled={busy}
                onClick={() => {
                  void onCopyPortalLink(row);
                  onOpenChange(false);
                }}
              >
                Copy portal link
              </button>
            ) : null}
            {canEditRoster ? (
              <>
                <div className="my-1 border-t border-border" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={destructiveItemClass}
                  disabled={busy}
                  onClick={() => {
                    onRemove(row);
                    onOpenChange(false);
                  }}
                >
                  Remove from roster
                </button>
              </>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {copyLinkState === "copied" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          Link copied
        </span>
      ) : copyLinkState === "error" ? (
        <span className="text-xs text-destructive">Copy failed</span>
      ) : null}
    </div>
  );
}
