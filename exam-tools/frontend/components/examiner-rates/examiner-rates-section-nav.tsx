"use client";

import {
  EXAMINER_RATES_NAV_GROUPS,
  type ExaminerRatesSectionId,
} from "@/lib/examiner-rates-draft";
import { formInputClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

export type ExaminerRatesSectionHint = Partial<Record<ExaminerRatesSectionId, string>>;

type Props = {
  activeSection: ExaminerRatesSectionId;
  onSelect: (section: ExaminerRatesSectionId) => void;
  hints?: ExaminerRatesSectionHint;
};

export function ExaminerRatesSectionNav({ activeSection, onSelect, hints }: Props) {
  const flatOptions = EXAMINER_RATES_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      value: item.id,
      label: `${group.label}: ${item.label}`,
    })),
  );

  return (
    <>
      <div className="md:hidden">
        <label className="sr-only" htmlFor="examiner-rates-section">
          Rates section
        </label>
        <select
          id="examiner-rates-section"
          className={formInputClass}
          value={activeSection}
          onChange={(e) => onSelect(e.target.value as ExaminerRatesSectionId)}
        >
          {flatOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <nav
        className="hidden w-52 shrink-0 flex-col gap-4 border-r border-border pr-3 md:flex lg:w-56"
        aria-label="Examiner rates sections"
      >
        {EXAMINER_RATES_NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => {
                const active = activeSection === item.id;
                const hint = hints?.[item.id];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted/60",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      <span
                        className={cn(
                          "mt-0.5 text-[11px] leading-snug",
                          active ? "text-primary/80" : "text-muted-foreground",
                        )}
                      >
                        {hint ?? item.description}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
