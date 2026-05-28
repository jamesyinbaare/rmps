"use client";

import type { TimetableSubjectFilter } from "@/lib/api";
import {
  normalizeSubjectScope,
  subjectScopeBadgeClass,
  subjectScopeLabel,
  type SubjectScope,
} from "@/lib/subject-scope-display";
import { cn } from "@/lib/utils";

const badgeBaseClass =
  "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-sm";

type SubjectScopeBadgeProps = {
  scope: string;
  className?: string;
  /** When true, omit uppercase styling (e.g. filter labels). */
  preserveCase?: boolean;
};

export function SubjectScopeBadge({ scope, className, preserveCase = false }: SubjectScopeBadgeProps) {
  const label = subjectScopeLabel(scope);
  return (
    <span
      className={cn(
        badgeBaseClass,
        !preserveCase && "uppercase",
        subjectScopeBadgeClass(scope),
        className,
      )}
      aria-label={`Subject scope: ${label}`}
    >
      {label}
    </span>
  );
}

export function SubjectScopeLegend({ className }: { className?: string }) {
  const scopes: SubjectScope[] = ["ALL", "CORE", "ELECTIVE"];
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="list"
      aria-label="Subject scope legend"
    >
      <span className="text-xs font-medium text-muted-foreground">Scope:</span>
      {scopes.map((scope) => (
        <SubjectScopeBadge key={scope} scope={scope} />
      ))}
    </div>
  );
}

export function timetableFilterScopeLabel(filter: TimetableSubjectFilter): string {
  if (filter === "CORE_ONLY") return "Core only";
  if (filter === "ELECTIVE_ONLY") return "Elective only";
  return "All subjects";
}

export function timetableFilterBadgeScope(filter: TimetableSubjectFilter): SubjectScope {
  if (filter === "CORE_ONLY") return "CORE";
  if (filter === "ELECTIVE_ONLY") return "ELECTIVE";
  return "ALL";
}

export function TimetableScopeFilterBadge({
  filter,
  className,
}: {
  filter: TimetableSubjectFilter;
  className?: string;
}) {
  const scope = timetableFilterBadgeScope(filter);
  const label = timetableFilterScopeLabel(filter);
  return (
    <span
      className={cn(
        badgeBaseClass,
        "normal-case tracking-normal",
        subjectScopeBadgeClass(scope),
        className,
      )}
      aria-label={`Active scope filter: ${label}`}
    >
      {label}
    </span>
  );
}

export function subjectScopeAriaLabel(scope: string): string {
  return `Subject scope: ${subjectScopeLabel(scope)}`;
}

export { normalizeSubjectScope };
