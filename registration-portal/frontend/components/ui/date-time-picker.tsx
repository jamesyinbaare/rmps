"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateTimePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled = false,
  label,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [timeValue, setTimeValue] = React.useState(
    value ? format(value, "HH:mm") : "00:00"
  );

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange(null);
      setTimeValue("00:00");
      return;
    }

    // Combine selected date with current time
    const [hours, minutes] = timeValue.split(":").map(Number);
    const newDate = new Date(date);
    newDate.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(newDate);
  };

  const handleTimeChange = (time: string) => {
    setTimeValue(time);
    // If we have a date value, update it with the new time
    if (value) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(value);
      newDate.setHours(hours || 0, minutes || 0, 0, 0);
      onChange(newDate);
    } else {
      // If no date is selected yet, create a date with today's date and the selected time
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date();
      newDate.setHours(hours || 0, minutes || 0, 0, 0);
      onChange(newDate);
    }
  };

  React.useEffect(() => {
    if (value) {
      setTimeValue(format(value, "HH:mm"));
    }
  }, [value]);

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
              format(value, "PPP HH:mm")
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
              onSelect={handleDateSelect}
              disabled={disabled}
              initialFocus
              captionLayout="dropdown"
            />
            <div className="border-t p-3 bg-card">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="time" className="text-sm">
                  Time
                </Label>
              </div>
              <Input
                id="time"
                type="time"
                value={timeValue}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="mt-2"
                disabled={disabled}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
