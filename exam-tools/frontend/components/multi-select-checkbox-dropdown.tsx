"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export type MultiSelectCheckboxOption = {
  value: string;
  label: string;
};

type Props = {
  id?: string;
  label?: string;
  options: MultiSelectCheckboxOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel?: string;
  disabled?: boolean;
  triggerClassName?: string;
};

export function MultiSelectCheckboxDropdown({
  id,
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
  disabled = false,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);

  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return allLabel;
    if (selected.length === 1) {
      const match = options.find((o) => o.value === selected[0]);
      return match?.label ?? "1 selected";
    }
    return `${selected.length} selected`;
  }, [allLabel, options, selected]);

  function toggle(value: string, checked: boolean) {
    if (checked) {
      onChange([...selected, value]);
    } else {
      onChange(selected.filter((v) => v !== value));
    }
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div>
      {label ? (
        <label className={formLabelClass} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              "mt-1 flex w-full min-w-[10rem] items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm",
              inputFocusRing,
              disabled && "cursor-not-allowed opacity-60",
              triggerClassName,
            )}
            aria-expanded={open}
            aria-haspopup="listbox"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(100vw-2rem,18rem)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Select one or more</p>
            {selected.length > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={clearAll}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {options.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={`size-4 shrink-0 rounded border-border ${inputFocusRing}`}
                  checked={selected.includes(opt.value)}
                  disabled={disabled}
                  onChange={(e) => toggle(opt.value, e.target.checked)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
