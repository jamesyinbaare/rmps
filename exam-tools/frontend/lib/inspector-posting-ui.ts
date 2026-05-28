import type { MyInspectorPostingRow } from "@/lib/api";
import {
  normalizeSubjectScope,
  subjectScopeBadgeClass,
  type SubjectScope,
} from "@/lib/subject-scope-display";
import { cn } from "@/lib/utils";

export type InspectorPostingScope = SubjectScope;

export const INSPECTOR_SCOPE_TEXT_STYLES: Record<InspectorPostingScope, string> = {
  ALL: "text-secondary-foreground",
  CORE: "text-primary",
  ELECTIVE: "text-amber-700 dark:text-amber-300",
};

export function normalizePostingScope(scope: string): InspectorPostingScope {
  return normalizeSubjectScope(scope);
}

export function postingScopeLabel(scope: string): string {
  const key = normalizePostingScope(scope);
  if (key === "CORE") return "Core";
  if (key === "ELECTIVE") return "Elective";
  return "Core & elective";
}

export function formatInspectorPostingTitle(p: MyInspectorPostingRow): string {
  return `${postingScopeLabel(p.subject_scope)} — ${p.center_name} (${p.center_code})`;
}

/** User-facing copy for the inspector workspace picker (no “scope” jargon). */
export const inspectorWorkspacePickerCopy = {
  selectTitle: "Choose your centre",
  switchTitle: "Change centre",
  selectDescription: "Pick your active examination centre.",
  switchDescription:
    "Choose a different centre, or the same centre on Core or Elective subjects.",
  continue: "Continue",
  confirmSwitch: "Use this centre",
  searchPlaceholder: "Centre name, code, or Core/Elective…",
  radiogroupLabel: "Your centre assignments",
} as const;

export function scopeBadgeClassName(scope: string): string {
  return cn(
    "inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide shadow-sm",
    subjectScopeBadgeClass(scope),
  );
}

/** Centred bold scope headline on workspace picker cards. */
export function scopePickerHeadlineClassName(scope: string): string {
  return cn(
    "text-lg font-bold tracking-wide",
    INSPECTOR_SCOPE_TEXT_STYLES[normalizePostingScope(scope)] ?? "text-muted-foreground",
  );
}
