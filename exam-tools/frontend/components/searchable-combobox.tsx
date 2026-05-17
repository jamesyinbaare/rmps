"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableComboboxProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  widthClass?: string;
  popoverWidthClass?: string;
  /** When false, the list has no “All” row; the user must pick an option. */
  showAllOption?: boolean;
  /** Label for the clear-all row when `showAllOption` is true (default “All”). */
  allOptionLabel?: string;
  /** Fired when the user types in the search box (for server-backed lists). */
  onSearchChange?: (query: string) => void;
  disabled?: boolean;
};

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No match.",
  widthClass = "w-[280px]",
  popoverWidthClass,
  showAllOption = true,
  allOptionLabel = "All",
  onSearchChange,
  disabled = false,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-11 min-h-11 justify-between font-normal sm:h-10 sm:min-h-10", widthClass)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0",
          popoverWidthClass ?? "w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,24rem)]",
          widthClass === "w-full" ? "min-w-[var(--radix-popover-trigger-width)]" : widthClass,
        )}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={onSearchChange ? false : true}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9"
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showAllOption ? (
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === "" ? "opacity-100" : "opacity-0")} />
                  {allOptionLabel}
                </CommandItem>
              ) : null}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
