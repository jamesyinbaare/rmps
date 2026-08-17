import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  includes: string[];
  excludes?: string[];
  includeHeading?: string;
  excludeHeading?: string;
};

export function ExaminerAllowanceIncludeExcludeLists({
  includes,
  excludes,
  includeHeading = "Included",
  excludeHeading = "Not included",
}: Props) {
  const hasExcludes = Boolean(excludes && excludes.length > 0);

  return (
    <div className={cn("grid gap-2", hasExcludes && "sm:grid-cols-2")}>
      <div
        className={cn(
          "rounded-lg border px-2.5 py-2",
          "border-emerald-500/35 bg-emerald-500/10",
        )}
      >
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          {includeHeading}
        </p>
        <ul className="space-y-1">
          {includes.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-xs leading-snug text-emerald-950 dark:text-emerald-50">
              <Check
                className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {hasExcludes ? (
        <div
          className={cn(
            "rounded-lg border px-2.5 py-2",
            "border-rose-500/35 bg-rose-500/10",
          )}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-300">
            {excludeHeading}
          </p>
          <ul className="space-y-1">
            {excludes!.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-xs leading-snug text-rose-950 dark:text-rose-50">
                <X className="mt-0.5 size-3 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
