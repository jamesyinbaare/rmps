"use client";

import type { SubjectOfficerWorkspaceOption } from "@/lib/subject-officer-exams";
import { cn } from "@/lib/utils";

type Props = {
  workspace: SubjectOfficerWorkspaceOption | null;
  workspaceLabel?: string | null;
  className?: string;
};

/** Read-only workspace context for subject-officer command bars. */
export function SubjectOfficerWorkspaceStrip({ workspace, workspaceLabel, className }: Props) {
  const label =
    workspaceLabel ??
    (workspace ? `${workspace.examinationName} · ${workspace.subjectLabel}` : null);

  if (!label) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 max-md:px-2.5 max-md:py-1.5",
        className,
      )}
    >
      <span className="shrink-0 text-xs font-medium text-muted-foreground max-md:sr-only">Workspace</span>
      <span className="shrink-0 text-muted-foreground/50 max-md:hidden" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
