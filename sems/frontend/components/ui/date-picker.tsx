"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> {
  control: Control<TFieldValues>;
  name: TName;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  name,
  placeholder = "Pick a date",
  disabled = false,
}: DatePickerProps<TFieldValues, TName>) {
  const [open, setOpen] = React.useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !field.value && "text-muted-foreground"
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {field.value ? format(field.value as Date, "PPP") : <span>{placeholder}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={field.value as Date | undefined}
              onSelect={(date) => {
                field.onChange(date || null);
                if (date) {
                  setOpen(false);
                }
              }}
              disabled={disabled}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}
    />
  );
}
