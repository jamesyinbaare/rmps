"use client";

import { ChevronDown, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ExaminersToolsMenuItem = {
  key: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  hidden?: boolean;
};

export type ExaminersToolsMenuSection = {
  label?: string;
  items: ExaminersToolsMenuItem[];
};

type Props = {
  sections: ExaminersToolsMenuSection[];
  disabled?: boolean;
  onSelect: (key: string) => void;
};

export function ExaminersToolsMenu({ sections, disabled = false, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.hidden),
    }))
    .filter((section) => section.items.length > 0);

  if (visibleSections.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Wrench className="size-4" aria-hidden />
          Tools
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex flex-col gap-3">
          {visibleSections.map((section, sectionIndex) => (
            <div key={section.label ?? sectionIndex}>
              {section.label ? (
                <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </p>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                        )}
                        disabled={disabled || item.disabled}
                        onClick={() => {
                          setOpen(false);
                          onSelect(item.key);
                        }}
                      >
                        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                        <span className="min-w-0">
                          <span className="block font-medium">{item.label}</span>
                          {item.description ? (
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
