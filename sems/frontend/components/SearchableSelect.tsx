"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  className,
  emptyMessage = "No results found.",
  searchPlaceholder = "Search...",
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [buttonRef, setButtonRef] = React.useState<HTMLButtonElement | null>(null);
  const [displayText, setDisplayText] = React.useState<string>("");

  const selectedOption = options.find((option) => option.value === value);

  // Truncate text to fit button width
  React.useEffect(() => {
    if (!buttonRef || !selectedOption) {
      setDisplayText("");
      return;
    }

    const truncateText = () => {
      const buttonWidth = buttonRef.offsetWidth;
      if (buttonWidth === 0) {
        // Button not yet rendered
        setDisplayText(selectedOption.label);
        return;
      }

      const padding = 60; // Account for icon and padding
      const availableWidth = buttonWidth - padding;

      // Use a temporary span to measure text width more accurately
      const measureEl = document.createElement("span");
      measureEl.style.visibility = "hidden";
      measureEl.style.position = "absolute";
      measureEl.style.whiteSpace = "nowrap";
      measureEl.style.font = getComputedStyle(buttonRef).font;
      document.body.appendChild(measureEl);

      measureEl.textContent = selectedOption.label;
      const textWidth = measureEl.offsetWidth;

      if (textWidth <= availableWidth) {
        document.body.removeChild(measureEl);
        setDisplayText(selectedOption.label);
        return;
      }

      // Binary search for optimal truncation point
      let low = 0;
      let high = selectedOption.label.length;
      let bestLength = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testText = selectedOption.label.slice(0, mid) + "...";
        measureEl.textContent = testText;
        const testWidth = measureEl.offsetWidth;

        if (testWidth <= availableWidth) {
          bestLength = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      document.body.removeChild(measureEl);
      setDisplayText(
        bestLength > 0
          ? selectedOption.label.slice(0, bestLength) + "..."
          : "..."
      );
    };

    // Use ResizeObserver for more efficient resize handling
    const resizeObserver = new ResizeObserver(truncateText);
    if (buttonRef) {
      resizeObserver.observe(buttonRef);
    }

    // Initial truncation
    truncateText();

    return () => {
      resizeObserver.disconnect();
    };
  }, [buttonRef, selectedOption]);

  const handleClear = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    onValueChange(undefined);
    setOpen(false);
  }, [onValueChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={setButtonRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          onPointerDown={(e) => {
            // Don't open popover if clicking on the clear button
            if ((e.target as HTMLElement).closest('[data-clear-button]') ||
                (e.target as HTMLElement).closest('[data-clear-container]')) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <span className="truncate">
            {selectedOption ? displayText || selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && value !== "" && (
              <div
                data-clear-container
                className="flex items-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={handleClear}
              >
                <X
                  data-clear-button
                  className="h-4 w-4 opacity-70 hover:opacity-100 cursor-pointer transition-opacity z-10 relative"
                  role="button"
                  tabIndex={-1}
                />
              </div>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                // Include label in value for searchability, but use a delimiter
                const searchValue = `${option.label} ${option.value}`;
                return (
                  <CommandItem
                    key={option.value}
                    value={searchValue}
                    onSelect={() => {
                      const newValue = option.value === value ? undefined : option.value;
                      onValueChange(newValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
