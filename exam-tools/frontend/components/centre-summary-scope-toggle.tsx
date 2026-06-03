"use client";

import type { TimetableSubjectFilter } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUBJECT_SCOPE_OPTIONS: { value: TimetableSubjectFilter; label: string; hint: string }[] = [
  { value: "CORE_ONLY", label: "Core", hint: "Core subjects only" },
  { value: "ELECTIVE_ONLY", label: "Elective", hint: "Elective subjects only" },
  { value: "ALL", label: "All", hint: "Include core and elective examination days" },
];

const fieldLabelClass = "text-xs font-medium text-muted-foreground";

type Props = {
  value: TimetableSubjectFilter;
  onChange: (value: TimetableSubjectFilter) => void;
  disabled?: boolean;
  sectionId?: string;
  className?: string;
};

export function CentreSummaryScopeToggle({
  value,
  onChange,
  disabled = false,
  sectionId = "centre-summary",
  className,
}: Props) {
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col gap-1", className)}
      title="Choose which subject types to include in centre totals and official lists."
    >
      <legend className={fieldLabelClass}>Subject scope</legend>
      <div
        className="inline-flex rounded-lg border border-input-border bg-muted/30 p-0.5 shadow-sm"
        role="radiogroup"
        aria-label="Subject scope"
      >
        {SUBJECT_SCOPE_OPTIONS.map((opt) => {
          const id = `${sectionId}-scope-${opt.value}`;
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              title={opt.hint}
              className={cn(
                "flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
                checked
                  ? "bg-card text-foreground shadow-sm ring-1 ring-success/25"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <input
                id={id}
                type="radio"
                name={`${sectionId}-scope`}
                className="sr-only"
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function centreSummaryScopeChipLabel(filter: TimetableSubjectFilter): string {
  const opt = SUBJECT_SCOPE_OPTIONS.find((o) => o.value === filter);
  return opt ? `Scope: ${opt.label}` : `Scope: ${filter}`;
}
