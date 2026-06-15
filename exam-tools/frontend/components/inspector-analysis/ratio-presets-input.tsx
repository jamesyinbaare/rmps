"use client";

import { useEffect, useState } from "react";

import { DEFAULT_INSPECTOR_CANDIDATES_RATIO, MAX_INSPECTOR_CANDIDATES_RATIO } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const PRESETS = [300, 250, 200] as const;

type Props = {
  id: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function RatioPresetsInput({ id, value, disabled = false, onChange }: Props) {
  const isPreset = PRESETS.includes(value as (typeof PRESETS)[number]);
  const [customMode, setCustomMode] = useState(!isPreset);

  useEffect(() => {
    if (PRESETS.includes(value as (typeof PRESETS)[number])) {
      setCustomMode(false);
    }
  }, [value]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className={formLabelClass} htmlFor={id}>
        Candidates per inspector
      </label>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            aria-pressed={!customMode && value === preset}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              !customMode && value === preset
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setCustomMode(false);
              onChange(preset);
            }}
          >
            {preset}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={customMode}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
            customMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setCustomMode(true)}
        >
          Custom
        </button>
      </div>
      {customMode ? (
        <input
          id={id}
          type="number"
          min={1}
          max={MAX_INSPECTOR_CANDIDATES_RATIO}
          step={1}
          disabled={disabled}
          className={cn(formInputClass, "mt-0")}
          value={value}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.min(Math.max(1, parsed), MAX_INSPECTOR_CANDIDATES_RATIO));
          }}
        />
      ) : (
        <input id={id} type="hidden" value={value} readOnly />
      )}
      <p className="min-h-10 text-xs leading-snug text-muted-foreground">
        At {value}:1, required = ceil(candidates ÷ {value}). Click Load report after changing.
      </p>
    </div>
  );
}

export { DEFAULT_INSPECTOR_CANDIDATES_RATIO };
