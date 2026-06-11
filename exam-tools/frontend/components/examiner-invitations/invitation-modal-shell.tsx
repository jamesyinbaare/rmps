"use client";

import { INPUT_FOCUS_RING } from "@/components/examiner-invitations/constants";

type Props = {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  canClose?: boolean;
  panelClassName?: string;
  footer?: React.ReactNode;
};

export function InvitationModalShell({
  title,
  titleId,
  children,
  onClose,
  canClose = true,
  panelClassName = "max-w-lg",
  footer,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => canClose && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg ${panelClassName}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 ${INPUT_FOCUS_RING}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-6 border-t border-border pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
