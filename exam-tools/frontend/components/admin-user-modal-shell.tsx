"use client";

import { useId, type ReactNode } from "react";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const adminUserBtnSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 ${inputFocusRing}`;

export const adminUserBtnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;

type AdminUserModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  children: ReactNode;
};

export function AdminUserModalShell({
  open,
  onClose,
  title,
  description,
  headerActions,
  footer,
  closeDisabled = false,
  children,
}: AdminUserModalShellProps) {
  const titleId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerActions}
            <button
              type="button"
              disabled={closeDisabled}
              onClick={onClose}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 ${inputFocusRing}`}
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          {footer ?? (
            <button
              type="button"
              disabled={closeDisabled}
              onClick={onClose}
              className={adminUserBtnSecondary}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
