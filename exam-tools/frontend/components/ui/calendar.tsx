"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButtonProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarSize = "default" | "large";

const CALENDAR_CELL_SIZE: Record<CalendarSize, string> = {
  default: "size-9",
  large: "size-full min-w-0 max-h-full max-w-full",
};

function CalendarDayButton({
  className,
  day,
  modifiers,
  cellSizeClass,
  ...props
}: DayButtonProps & { cellSizeClass?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "relative flex flex-col items-center justify-center gap-0.5 p-0 font-normal aria-selected:opacity-100",
        cellSizeClass ?? CALENDAR_CELL_SIZE.default,
        modifiers.selected &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        modifiers.today && !modifiers.selected && "bg-accent/15 text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  size?: CalendarSize;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  size = "default",
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();
  const cellSizeClass = CALENDAR_CELL_SIZE[size];
  const isLarge = size === "large";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(isLarge ? "min-w-0 p-2 sm:p-4" : "p-3", className)}
      classNames={{
        root: cn(isLarge ? "w-full" : "w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4 sm:flex-row", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        month_caption: cn(
          "relative flex w-full items-center justify-center px-1",
          isLarge ? "h-10" : "h-9",
          defaultClassNames.month_caption,
        ),
        caption_label: cn(
          isLarge ? "text-base font-semibold" : "text-sm font-medium",
          defaultClassNames.caption_label,
        ),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          isLarge ? "size-9" : "size-8",
          "relative z-10 bg-background p-0 opacity-80 hover:opacity-100",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          isLarge ? "size-9" : "size-8",
          "relative z-10 bg-background p-0 opacity-80 hover:opacity-100",
          defaultClassNames.button_next,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn(isLarge ? "" : "flex w-full", defaultClassNames.weekdays),
        weekday: cn(
          "rounded-md font-medium text-muted-foreground",
          isLarge
            ? "flex min-w-0 items-center justify-center text-[0.625rem] sm:text-xs"
            : "w-9 text-[0.7rem]",
          defaultClassNames.weekday,
        ),
        week: cn(isLarge ? "mt-0.5" : "mt-1 flex w-full", defaultClassNames.week),
        day: cn(
          "relative flex items-center justify-center p-0 text-center",
          isLarge ? "min-w-0 flex-1 aspect-square" : "h-9 w-9 text-sm",
          defaultClassNames.day,
        ),
        day_button: cn(cellSizeClass, "p-0 font-normal aria-selected:opacity-100", defaultClassNames.day_button),
        selected: cn(
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          defaultClassNames.selected,
        ),
        today: cn("bg-accent/15 text-accent-foreground", defaultClassNames.today),
        outside: cn("text-muted-foreground opacity-40", defaultClassNames.outside),
        disabled: cn("text-muted-foreground opacity-40", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", chevronClassName)} {...chevronProps} />;
        },
        DayButton: (dayButtonProps) => (
          <CalendarDayButton {...dayButtonProps} cellSizeClass={cellSizeClass} />
        ),
        ...components,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
