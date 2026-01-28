"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Subject } from "@/types";

interface SearchableSubjectSelectProps {
  subjects: Subject[];
  value: string | null;
  onValueChange: (subjectId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function SearchableSubjectSelect({
  subjects,
  value,
  onValueChange,
  placeholder = "Search or select subject...",
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchableSubjectSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedSubject = subjects.find((s) => s.id === value);

  const filteredSubjects = React.useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.trim().toLowerCase();
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [subjects, search]);

  const handleSelect = (subject: Subject) => {
    onValueChange(subject.id);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onValueChange(null);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-left h-auto min-h-9",
            !selectedSubject && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedSubject ? selectedSubject.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-1 border-b">
          <input
            placeholder="Type to search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
        </div>
        <div className="max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-auto p-1">
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
              !value && "bg-accent"
            )}
          >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
              {!value ? <Check className="h-4 w-4" /> : null}
            </span>
            Clear selection
          </button>
          {filteredSubjects.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No subject found.
            </div>
          ) : (
            filteredSubjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                onClick={() => handleSelect(subject)}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === subject.id && "bg-accent"
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {value === subject.id ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </span>
                <span className="truncate">{subject.name}</span>
                {subject.code ? (
                  <span className="ml-2 text-muted-foreground truncate">
                    ({subject.code})
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
