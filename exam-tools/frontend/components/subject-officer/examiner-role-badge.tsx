"use client";

import { examinerRoleAbbrev, examinerRoleLabel } from "@/components/subject-officer/subject-officer-examiner-utils";
import { cn } from "@/lib/utils";

type Props = {
  examinerType: string;
  variant?: "default" | "selected" | "secondary";
  className?: string;
};

export function ExaminerRoleBadge({ examinerType, variant = "default", className }: Props) {
  const abbrev = examinerRoleAbbrev(examinerType);
  const fullRole = examinerRoleLabel(examinerType);

  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        variant === "selected" &&
          "border border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground",
        variant === "default" && "border border-border bg-muted/50 font-medium text-muted-foreground",
        variant === "secondary" &&
          "border-0 bg-secondary font-normal tracking-wide text-secondary-foreground",
        className,
      )}
      title={abbrev !== fullRole ? fullRole : undefined}
    >
      {abbrev}
    </span>
  );
}
