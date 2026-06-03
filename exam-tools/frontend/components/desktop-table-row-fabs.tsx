"use client";

import { type MouseEvent, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const fabBaseClass = cn(
  "inline-flex size-10 items-center justify-center rounded-full border bg-card shadow-md",
  "transition-[transform,box-shadow,background-color,color,border-color] duration-200 ease-out",
  "motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg",
  "active:scale-[0.97] motion-reduce:active:scale-100",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
  "disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-40 disabled:shadow-sm",
);

type FabActionProps = {
  label: string;
  hint: string;
  disabled: boolean;
  disabledTip: string | null;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className: string;
  children: ReactNode;
};

function FabAction({ label, hint, disabled, disabledTip, onClick, className, children }: FabActionProps) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(fabBaseClass, className)}
      aria-label={label}
    >
      {children}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex cursor-not-allowed">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="px-2 py-1">
        {disabledTip ?? hint}
      </TooltipContent>
    </Tooltip>
  );
}

export type DesktopTableRowFabActionsProps = {
  /** Accessible name for the row (used in labels). */
  rowLabel: string;
  busy: boolean;
  mutationsEnabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  editIcon: ReactNode;
  deleteIcon: ReactNode;
};

/**
 * Mini FAB pair for desktop data tables — reveal on row hover, 40px targets, tooltips.
 */
export function DesktopTableRowFabActions({
  rowLabel,
  busy,
  mutationsEnabled,
  onEdit,
  onDelete,
  editIcon,
  deleteIcon,
}: DesktopTableRowFabActionsProps) {
  const disabled = busy || !mutationsEnabled;
  const disabledTip = !mutationsEnabled ? "Closed" : busy ? "Wait…" : null;

  function handleClick(handler: () => void) {
    return (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handler();
    };
  }

  return (
    <div
      role="toolbar"
      aria-label={`Actions for ${rowLabel}`}
      className={cn(
        "inline-flex items-center gap-2.5 transition-opacity duration-200",
        "md:opacity-55 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100",
        "md:motion-reduce:opacity-100",
        disabled && "md:opacity-40",
      )}
    >
      <FabAction
        label={`Edit ${rowLabel}`}
        hint="Edit"
        disabled={disabled}
        disabledTip={disabledTip}
        onClick={handleClick(onEdit)}
        className="border-primary/25 text-primary hover:border-primary/40 hover:bg-primary hover:text-primary-foreground"
      >
        {editIcon}
      </FabAction>
      <FabAction
        label={`Delete ${rowLabel}`}
        hint="Delete"
        disabled={disabled}
        disabledTip={disabledTip}
        onClick={handleClick(onDelete)}
        className="border-destructive/20 text-destructive/90 hover:border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
      >
        {deleteIcon}
      </FabAction>
    </div>
  );
}

/** Sticky desktop actions column — keeps FABs visible when table scrolls horizontally. */
export const desktopTableActionsHeaderClass = cn(
  "sticky right-0 z-10 w-28 bg-muted/50 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
  "shadow-[-8px_0_16px_-12px] shadow-black/10 backdrop-blur-sm dark:shadow-black/25",
);

export const desktopTableActionsCellClass = cn(
  "sticky right-0 z-10 bg-card px-2 py-2 align-middle",
  "shadow-[-8px_0_16px_-12px] shadow-black/10 transition-colors group-hover/row:bg-muted/25 dark:shadow-black/25",
);
