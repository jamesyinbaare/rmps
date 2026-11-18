"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  label,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? (
              format(value, "PPP")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-card" align="start">
          <div className="p-3 bg-card">
            <Calendar
              mode="single"
              selected={value || undefined}
              onSelect={(date) => {
                onChange(date || null);
                if (date) {
                  setOpen(false);
                }
              }}
              disabled={disabled}
              initialFocus
              captionLayout="dropdown"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
