"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Subject } from "@/types/document";
import { cn } from "@/lib/utils";

export type SubjectTypeFilterValue = "ALL" | "CORE" | "ELECTIVE";

interface SubjectMultiSelectFilterProps {
  subjects: Subject[];
  value: number[];
  onChange: (ids: number[]) => void;
  subjectType: SubjectTypeFilterValue;
  onSubjectTypeChange: (value: SubjectTypeFilterValue) => void;
  disabled?: boolean;
  className?: string;
}

export function SubjectMultiSelectFilter({
  subjects,
  value,
  onChange,
  subjectType,
  onSubjectTypeChange,
  disabled = false,
  className,
}: SubjectMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return subjects
      .filter((subject) => {
        const matchesType = subjectType === "ALL" || subject.subject_type === subjectType;
        if (!matchesType) return false;
        if (!query) return true;
        return (
          subject.code.toLowerCase().includes(query) ||
          subject.name.toLowerCase().includes(query) ||
          (subject.original_code || "").toLowerCase().includes(query)
        );
      })
      .slice()
      .sort((a, b) => {
        const aSelected = value.includes(a.id) ? 0 : 1;
        const bSelected = value.includes(b.id) ? 0 : 1;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.code.localeCompare(b.code);
      });
  }, [subjects, subjectType, search, value]);

  const triggerLabel = useMemo(() => {
    if (value.length === 0) return "All subjects";
    if (value.length === 1) {
      const subject = subjects.find((item) => item.id === value[0]);
      return subject ? `${subject.code} - ${subject.name}` : "1 subject";
    }
    return `${value.length} subjects`;
  }, [value, subjects]);

  const allFilteredSelected =
    filteredSubjects.length > 0 &&
    filteredSubjects.every((subject) => value.includes(subject.id));

  const toggleSubject = (subjectId: number, checked: boolean) => {
    if (checked) {
      if (value.includes(subjectId)) return;
      onChange([...value, subjectId]);
      return;
    }
    onChange(value.filter((id) => id !== subjectId));
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const next = new Set(value);
      for (const subject of filteredSubjects) next.add(subject.id);
      onChange(Array.from(next));
      return;
    }
    const filteredIds = new Set(filteredSubjects.map((subject) => subject.id));
    onChange(value.filter((id) => !filteredIds.has(id)));
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select
        value={subjectType}
        onValueChange={(next) => onSubjectTypeChange(next as SubjectTypeFilterValue)}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-8 w-[110px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All types</SelectItem>
          <SelectItem value="CORE">Core</SelectItem>
          <SelectItem value="ELECTIVE">Elective</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-[180px] max-w-[260px] justify-between gap-1.5 font-normal"
            disabled={disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-2 p-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-medium text-muted-foreground">Subjects</p>
            {filteredSubjects.length > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) => toggleSelectAllFiltered(checked === true)}
                />
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </label>
            )}
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or name…"
            className="h-8"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filteredSubjects.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No{" "}
                {subjectType === "ALL" ? "" : `${subjectType.toLowerCase()} `}
                subjects found
              </p>
            ) : (
              filteredSubjects.map((subject) => {
                const checked = value.includes(subject.id);
                return (
                  <label
                    key={subject.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      checked && "bg-accent/60"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => toggleSubject(subject.id, next === true)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {subject.code} - {subject.name}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                      {subject.subject_type === "CORE" ? "Core" : "Elective"}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {value.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="flex flex-wrap gap-1">
                {value.slice(0, 8).map((id) => {
                  const subject = subjects.find((item) => item.id === id);
                  if (!subject) return null;
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="h-5 max-w-[140px] gap-1 pr-1 text-[10px]"
                    >
                      <span className="truncate">{subject.code}</span>
                      <button
                        type="button"
                        className="rounded-sm hover:bg-muted"
                        onClick={() => toggleSubject(id, false)}
                        aria-label={`Remove ${subject.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                {value.length > 8 && (
                  <Badge variant="outline" className="h-5 text-[10px]">
                    +{value.length - 8}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => onChange([])}
              >
                Clear subjects
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
