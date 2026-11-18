"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = React.useState("");
  const [buttonRef, setButtonRef] = React.useState<HTMLButtonElement | null>(null);
  const [displayText, setDisplayText] = React.useState<string>("");

  const selectedOption = options.find((option) => option.value === value);

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const searchLower = search.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  // Truncate text to fit button width
  React.useEffect(() => {
    if (!buttonRef || !selectedOption) {
      setDisplayText("");
      return;
    }

    const truncateText = () => {
      const buttonWidth = buttonRef.offsetWidth;
      if (buttonWidth === 0) {
        setDisplayText(selectedOption.label);
        return;
      }

      const padding = 60;
      const availableWidth = buttonWidth - padding;

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

    const resizeObserver = new ResizeObserver(truncateText);
    if (buttonRef) {
      resizeObserver.observe(buttonRef);
    }

    truncateText();

    return () => {
      resizeObserver.disconnect();
    };
  }, [buttonRef, selectedOption]);

  const handleSelect = React.useCallback((selectedValue: string) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearch("");
  }, [onValueChange]);

  const handleClear = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    onValueChange(undefined);
    setSearch("");
  }, [onValueChange]);

  // Prevent popover from opening when disabled or no options
  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (disabled || options.length === 0) {
      setOpen(false);
      return;
    }
    setOpen(newOpen);
    if (!newOpen) {
      // Clear search when closing
      setSearch("");
    }
  }, [disabled, options.length]);

  return (
    <Popover open={open && !disabled && options.length > 0} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={setButtonRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled || options.length === 0}
          onPointerDown={(e) => {
            if (disabled || options.length === 0) {
              e.preventDefault();
              return;
            }
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
        <div className="p-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
            onKeyDown={(e) => {
              // Prevent closing popover when typing
              e.stopPropagation();
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-auto">
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
              {emptyMessage}
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = value === option.value;
              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
