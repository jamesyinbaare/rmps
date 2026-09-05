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
import type { School, SchoolRegion } from "@/types/document";
import { cn } from "@/lib/utils";

export type SchoolRegionFilterValue = "ALL" | SchoolRegion;

export const SCHOOL_REGION_OPTIONS: SchoolRegion[] = [
  "Ashanti Region",
  "Bono Region",
  "Bono East Region",
  "Ahafo Region",
  "Central Region",
  "Eastern Region",
  "Greater Accra Region",
  "Northern Region",
  "North East Region",
  "Savannah Region",
  "Upper East Region",
  "Upper West Region",
  "Volta Region",
  "Oti Region",
  "Western Region",
  "Western North Region",
];

function shortRegionLabel(region: SchoolRegion): string {
  return region.replace(/ Region$/i, "");
}

interface SchoolMultiSelectFilterProps {
  schools: School[];
  value: number[];
  onChange: (ids: number[]) => void;
  region: SchoolRegionFilterValue;
  onRegionChange: (value: SchoolRegionFilterValue) => void;
  disabled?: boolean;
  className?: string;
  hideRegionFilter?: boolean;
  emptyLabel?: string;
  fullWidth?: boolean;
}

export function SchoolMultiSelectFilter({
  schools,
  value,
  onChange,
  region,
  onRegionChange,
  disabled = false,
  className,
  hideRegionFilter = false,
  emptyLabel = "All schools",
  fullWidth = false,
}: SchoolMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSchools = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schools
      .filter((school) => {
        const matchesRegion = region === "ALL" || school.region === region;
        if (!matchesRegion) return false;
        if (!query) return true;
        return (
          school.code.toLowerCase().includes(query) ||
          school.name.toLowerCase().includes(query) ||
          (school.s_code || "").toLowerCase().includes(query) ||
          school.region.toLowerCase().includes(query)
        );
      })
      .slice()
      .sort((a, b) => {
        const aSelected = value.includes(a.id) ? 0 : 1;
        const bSelected = value.includes(b.id) ? 0 : 1;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.code.localeCompare(b.code);
      });
  }, [schools, region, search, value]);

  const triggerLabel = useMemo(() => {
    if (value.length === 0) return emptyLabel;
    if (value.length === 1) {
      const school = schools.find((item) => item.id === value[0]);
      return school ? `${school.code} - ${school.name}` : "1 school";
    }
    return `${value.length} schools`;
  }, [value, schools, emptyLabel]);

  const regionCue = region === "ALL" ? null : shortRegionLabel(region);

  const allFilteredSelected =
    filteredSchools.length > 0 &&
    filteredSchools.every((school) => value.includes(school.id));

  const toggleSchool = (schoolId: number, checked: boolean) => {
    if (checked) {
      if (value.includes(schoolId)) return;
      onChange([...value, schoolId]);
      return;
    }
    onChange(value.filter((id) => id !== schoolId));
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const next = new Set(value);
      for (const school of filteredSchools) next.add(school.id);
      onChange(Array.from(next));
      return;
    }
    const filteredIds = new Set(filteredSchools.map((school) => school.id));
    onChange(value.filter((id) => !filteredIds.has(id)));
  };

  return (
    <div className={cn("inline-flex", fullWidth && "w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 justify-between gap-1.5 font-normal",
              fullWidth ? "h-9 w-full min-w-0 max-w-none" : "min-w-[180px] max-w-[320px]"
            )}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span className="truncate">{triggerLabel}</span>
              {regionCue ? (
                <span className="shrink-0 rounded border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {regionCue}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] space-y-2 p-2">
          <div className="flex items-center gap-2 px-1">
            {!hideRegionFilter ? (
              <Select
                value={region}
                onValueChange={(next) => onRegionChange(next as SchoolRegionFilterValue)}
                disabled={disabled}
              >
                <SelectTrigger size="sm" className="h-8 w-[148px] shrink-0">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All regions</SelectItem>
                  {SCHOOL_REGION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {shortRegionLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Schools</p>
              {filteredSchools.length > 0 && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) => toggleSelectAllFiltered(checked === true)}
                  />
                  {allFilteredSelected ? "Deselect all" : "Select all"}
                </label>
              )}
            </div>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, name, or region…"
            className="h-8"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filteredSchools.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No{region === "ALL" ? "" : ` ${shortRegionLabel(region)}`} schools found
              </p>
            ) : (
              filteredSchools.map((school) => {
                const checked = value.includes(school.id);
                return (
                  <label
                    key={school.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      checked && "bg-accent/60"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => toggleSchool(school.id, next === true)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {school.code} - {school.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {shortRegionLabel(school.region)}
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
                  const school = schools.find((item) => item.id === id);
                  if (!school) return null;
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="h-5 max-w-[140px] gap-1 pr-1 text-[10px]"
                    >
                      <span className="truncate">{school.code}</span>
                      <button
                        type="button"
                        className="rounded-sm hover:bg-muted"
                        onClick={() => toggleSchool(id, false)}
                        aria-label={`Remove ${school.name}`}
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
                Clear schools
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
