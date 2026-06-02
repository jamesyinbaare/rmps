"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";
import type { School } from "@/lib/api";
import { cn } from "@/lib/utils";

type BaseProps = {
  region: string;
  onRegionChange: (value: string) => void;
  className?: string;
};

type ViewSchoolFilterProps = BaseProps & {
  mode: "view";
  zone: string;
  onZoneChange: (value: string) => void;
  schoolSearch: string;
  schoolPickerOpen: boolean;
  onSchoolPickerOpenChange: (open: boolean) => void;
  onSchoolSearchChange: (value: string) => void;
  onClearSchoolSearch: () => void;
  onSelectSchool: (code: string, label: string) => void;
  schoolOptions: School[];
  schoolSearchLoading: boolean;
};

type EditSchoolFilterProps = BaseProps & {
  mode: "edit";
};

export type ScriptControlSchoolFiltersProps = ViewSchoolFilterProps | EditSchoolFilterProps;

function RegionField({ region, onRegionChange }: Pick<BaseProps, "region" | "onRegionChange">) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Region
      </label>
      <SearchableCombobox
        options={REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        value={region}
        onChange={onRegionChange}
        placeholder="All regions"
        searchPlaceholder="Search region…"
        widthClass="w-full"
      />
    </div>
  );
}

function RegionZoneFields({
  region,
  zone,
  onRegionChange,
  onZoneChange,
}: Pick<BaseProps, "region" | "onRegionChange"> & { zone: string; onZoneChange: (value: string) => void }) {
  return (
    <>
      <RegionField region={region} onRegionChange={onRegionChange} />
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Zone
        </label>
        <SearchableCombobox
          options={ZONE_OPTIONS.map((z) => ({ value: z.value, label: z.label }))}
          value={zone}
          onChange={onZoneChange}
          placeholder="All zones"
          searchPlaceholder="Search zone…"
          widthClass="w-full"
        />
      </div>
    </>
  );
}

function ViewSchoolSearch(props: ViewSchoolFilterProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        School search
      </label>
      <Popover open={props.schoolPickerOpen} onOpenChange={props.onSchoolPickerOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-auto min-h-11 w-full max-w-full items-center justify-between gap-2 py-2.5 font-normal whitespace-normal"
          >
            <span className="min-w-0 flex-1 break-words text-left leading-snug">
              {props.schoolSearch || "Filter by school name…"}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type code or name (min 2 chars)…"
              value={props.schoolSearch}
              onValueChange={props.onSchoolSearchChange}
            />
            <CommandList>
              <CommandEmpty>
                {props.schoolSearchLoading ? "Loading…" : "Type at least 2 characters."}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={props.onClearSchoolSearch}>Clear school filter</CommandItem>
                {props.schoolOptions.map((s) => (
                  <CommandItem
                    key={s.id}
                    onSelect={() => props.onSelectSchool(s.code, `${s.code} — ${s.name}`)}
                  >
                    <span className="font-mono text-xs">{s.code}</span>
                    <span className="ml-2 min-w-0 break-words text-muted-foreground">{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ScriptControlSchoolFilters(props: ScriptControlSchoolFiltersProps) {
  const hasAdvanced =
    props.mode === "view"
      ? Boolean(props.region.trim() || props.zone.trim() || props.schoolSearch.trim())
      : Boolean(props.region.trim());
  const [open, setOpen] = useState(hasAdvanced);

  return (
    <div className={cn("space-y-3", props.className)}>
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        More filters
        {hasAdvanced && !open ? (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Active</span>
        ) : null}
      </button>
      {open ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.mode === "view" ? (
            <RegionZoneFields
              region={props.region}
              zone={props.zone}
              onRegionChange={props.onRegionChange}
              onZoneChange={props.onZoneChange}
            />
          ) : (
            <RegionField region={props.region} onRegionChange={props.onRegionChange} />
          )}
          {props.mode === "view" ? <ViewSchoolSearch {...props} /> : null}
        </div>
      ) : null}
    </div>
  );
}
