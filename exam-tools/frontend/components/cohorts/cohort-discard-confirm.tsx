"use client";

import { Button } from "@/components/ui/button";

type Props = {
  entityLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CohortDiscardConfirm({ entityLabel = "cohort", onCancel, onConfirm }: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="text-sm text-amber-900 dark:text-amber-200">Discard unsaved changes?</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Keep editing
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onConfirm}>
          Discard
        </Button>
      </div>
    </div>
  );
}
