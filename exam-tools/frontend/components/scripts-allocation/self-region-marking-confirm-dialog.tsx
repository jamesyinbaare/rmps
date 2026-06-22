"use client";

import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  regionLabel: string;
  busy?: boolean;
  zIndexClass?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SelfRegionMarkingConfirmDialog({
  open,
  regionLabel,
  busy = false,
  zIndexClass = "z-[110]",
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/55 p-4`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-amber-500/30 bg-card shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="self-region-confirm-title"
        aria-describedby="self-region-confirm-desc"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 id="self-region-confirm-title" className="text-base font-semibold text-foreground">
                Allow self-region marking?
              </h2>
              <p id="self-region-confirm-desc" className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{regionLabel}</span> examiners would mark scripts from
                schools in <span className="font-medium text-foreground">{regionLabel}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Cross-marking normally sends examiners scripts from <em>other</em> regions. Self-region marking is uncommon
            and can reduce independence — turn it on only when that is what you intend.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
            onClick={onConfirm}
          >
            Allow for {regionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
