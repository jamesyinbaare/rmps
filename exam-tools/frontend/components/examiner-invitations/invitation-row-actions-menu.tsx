"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";

import { INPUT_FOCUS_RING } from "@/components/examiner-invitations/constants";
import type { ResendUiState } from "@/components/examiner-invitations/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExaminerInvitationRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  inv: ExaminerInvitationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  resendUi: ResendUiState | undefined;
  resendError: string | undefined;
  copyLinkState: "copied" | "error" | undefined;
  onCopyLink?: (inv: ExaminerInvitationRow) => void;
  onResend: (inv: ExaminerInvitationRow) => void;
  onViewAllocation?: (inv: ExaminerInvitationRow) => void;
};

export function InvitationRowActionsMenu({
  inv,
  open,
  onOpenChange,
  busy,
  resendUi,
  resendError,
  copyLinkState,
  onCopyLink,
  onResend,
  onViewAllocation,
}: Props) {
  const canCopy = Boolean(onCopyLink && inv.public_url);
  const canResend = inv.status === "pending" || inv.status === "expired";
  const canViewAllocation = Boolean(
    onViewAllocation && inv.status === "accepted" && inv.examiner_id,
  );
  const hasMenuItems = canCopy || canResend || canViewAllocation;

  if (!hasMenuItems) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const menuItemClass =
    "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col items-start gap-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy || resendUi === "sending"}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg border border-input-border px-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50",
              INPUT_FOCUS_RING,
            )}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            Actions
            <ChevronDown className={cn("size-4 shrink-0 opacity-60", open && "rotate-180")} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="z-[250] w-auto min-w-[11rem] p-1" sideOffset={4}>
          <div role="menu">
            {canCopy ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  onCopyLink?.(inv);
                  onOpenChange(false);
                }}
              >
                Copy link
              </button>
            ) : null}
            {canResend ? (
              <button
                type="button"
                role="menuitem"
                disabled={busy || resendUi === "sending"}
                className={menuItemClass}
                onClick={() => {
                  onResend(inv);
                  onOpenChange(false);
                }}
              >
                Resend SMS
              </button>
            ) : null}
            {canViewAllocation ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  onViewAllocation?.(inv);
                  onOpenChange(false);
                }}
              >
                View allocation
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {copyLinkState === "copied" ? (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Link copied</span>
      ) : copyLinkState === "error" ? (
        <span className="text-xs text-destructive">Copy failed</span>
      ) : resendUi === "sending" ? (
        <span className="text-xs text-muted-foreground">Sending…</span>
      ) : resendUi === "success" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          SMS resent
        </span>
      ) : resendUi === "error" ? (
        <span className="text-xs text-destructive" title={resendError}>
          {resendError ?? "Failed"}
        </span>
      ) : null}
    </div>
  );
}
