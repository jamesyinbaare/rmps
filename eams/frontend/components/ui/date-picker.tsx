"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Format used for form values (YYYY-MM-DD). */
export const DATE_FORMAT = "yyyy-MM-dd";

function toDate(value: string | null | undefined): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = parse(value, DATE_FORMAT, new Date());
  return isValid(d) ? d : undefined;
}

function fromDate(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, DATE_FORMAT);
}

export interface DatePickerProps {
  /** Value as YYYY-MM-DD string (form-friendly). */
  value?: string | null;
  /** Emits YYYY-MM-DD or null. */
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional label above the trigger. */
  label?: string;
  /** Min date (YYYY-MM-DD). Used for e.g. date of birth. */
  min?: string | null;
  /** Max date (YYYY-MM-DD). Defaults to today. */
  max?: string | null;
  /** Whether to use dropdown layout (month + year selector). */
  dropdown?: boolean;
  /** Accessible name for the trigger. */
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  label,
  min,
  max,
  dropdown = true,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = toDate(value ?? null);

  const startMonth = React.useMemo(() => {
    if (min) {
      const d = toDate(min);
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(new Date().getFullYear() - 100, 0, 1);
  }, [min]);

  const endMonth = React.useMemo(() => {
    if (max) {
      const d = toDate(max);
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  }, [max]);

  const disabledMatcher = React.useCallback(
    (d: Date) => {
      if (min) {
        const m = toDate(min);
        if (m && d < m) return true;
      }
      if (max) {
        const m = toDate(max);
        if (m && d > m) return true;
      }
      return false;
    },
    [min, max]
  );

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
            disabled={disabled}
            aria-label={ariaLabel ?? label ?? placeholder}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {date ? format(date, "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              onChange(fromDate(d ?? undefined));
              if (d) setOpen(false);
            }}
            disabled={disabledMatcher}
            defaultMonth={date ?? endMonth}
            startMonth={startMonth}
            endMonth={endMonth}
            captionLayout={dropdown ? "dropdown" : "label"}
            initialFocus
            className="rounded-md border"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
