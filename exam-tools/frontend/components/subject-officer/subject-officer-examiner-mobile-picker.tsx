"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, SlidersHorizontal } from "lucide-react";

import {
  filterMarkedScriptExaminers,
  markedScriptExaminerRegionOptions,
  markedScriptExaminerRoleOptions,
} from "@/components/subject-officer/marked-script-examiner-picker";
import { ExaminerRoleBadge } from "@/components/subject-officer/examiner-role-badge";
import {
  examinerRoleAbbrev,
  examinerRoleLabel,
  filterAllocationExaminers,
  regionLabel,
  sortAllocationExaminers,
} from "@/components/subject-officer/subject-officer-examiner-utils";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MarkedScriptReturnExaminerOption } from "@/lib/api";
import { cn } from "@/lib/utils";

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const multiSelectCompactTrigger = "!mt-0.5 h-9 min-h-9 py-1.5";

type Variant = "allocation" | "marked-scripts";

type Props = {
  examiners: MarkedScriptReturnExaminerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  variant: Variant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function triggerLabel(examiner: MarkedScriptReturnExaminerOption): string {
  return `${examiner.examiner_name} · ${examinerRoleAbbrev(examiner.examiner_type)} · ${regionLabel(examiner.region)}`;
}

function ExaminerPickerRow({
  examiner,
  selected,
  variant,
  showCheck,
}: {
  examiner: MarkedScriptReturnExaminerOption;
  selected: boolean;
  variant: Variant;
  showCheck: boolean;
}) {
  const region = regionLabel(examiner.region);
  const allVerified = examiner.pending_count === 0;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      {showCheck ? (
        <Check className={cn("mt-0.5 size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      ) : null}
      {variant === "marked-scripts" ? (
        <span
          className={cn(
            "mt-1.5 flex h-2.5 w-2.5 shrink-0 rounded-full",
            allVerified ? "bg-success" : "border-2 border-amber-500/70 bg-transparent",
          )}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-medium leading-snug">{examiner.examiner_name}</span>
          <ExaminerRoleBadge examinerType={examiner.examiner_type} />
        </span>
        <span className="mt-0.5 block truncate text-xs leading-snug text-muted-foreground">
          {region}
        </span>
      </span>
      {variant === "marked-scripts" && examiner.pending_count > 0 ? (
        <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:text-amber-300">
          {examiner.pending_count}
        </span>
      ) : null}
    </div>
  );
}

export function SubjectOfficerExaminerMobilePicker({
  examiners,
  selectedId,
  onSelect,
  variant,
  loading = false,
  disabled = false,
  className,
  id = "so-examiner-mobile-picker",
}: Props) {
  const [open, setOpen] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [detailSearch, setDetailSearch] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [pendingOnly, setPendingOnly] = useState(false);

  const pendingTotal = useMemo(
    () => examiners.filter((e) => e.pending_count > 0).length,
    [examiners],
  );

  const regionOptions = useMemo(() => markedScriptExaminerRegionOptions(examiners), [examiners]);
  const roleOptions = useMemo(() => markedScriptExaminerRoleOptions(examiners), [examiners]);

  const filteredExaminers = useMemo(() => {
    if (variant === "allocation") {
      const sorted = sortAllocationExaminers(examiners);
      if (!nameQuery.trim()) return sorted;
      return sortAllocationExaminers(filterAllocationExaminers(examiners, nameQuery));
    }
    return filterMarkedScriptExaminers(examiners, nameQuery, {
      pendingOnly,
      regions: regionFilter,
      roles: roleFilter,
      nameOnly: true,
    });
  }, [examiners, nameQuery, pendingOnly, regionFilter, roleFilter, variant]);

  const hasNameQuery = nameQuery.trim().length > 0;
  const hasActiveFilters = pendingOnly || regionFilter.length > 0 || roleFilter.length > 0;
  const shouldListOptions =
    variant === "allocation" ? hasNameQuery : hasNameQuery || hasActiveFilters;

  const listExaminers = useMemo(() => {
    if (!shouldListOptions) return [];
    return filteredExaminers;
  }, [filteredExaminers, shouldListOptions]);

  const selected = examiners.find((e) => e.examiner_id === selectedId) ?? null;

  const emptyText =
    variant === "allocation"
      ? hasNameQuery
        ? "No examiners found."
        : "Type an examiner name to search."
      : hasNameQuery
        ? "No examiners found."
        : hasActiveFilters
          ? "No examiners match these filters."
          : "Type an examiner name to search.";

  const helperText =
    examiners.length === 0
      ? loading
        ? "Loading examiners…"
        : "No examiners for this subject."
      : `${examiners.length} examiner${examiners.length === 1 ? "" : "s"} — type a name to search.`;

  function handleSelect(examinerId: string) {
    onSelect(examinerId);
    setOpen(false);
    setNameQuery("");
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="min-w-0">
        <label className={compactLabelClass} htmlFor={id}>
          Examiner
        </label>
        <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{helperText}</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled || loading}
              className="h-11 w-full min-w-0 justify-between gap-2 text-sm font-normal"
            >
              <span
                title={selected ? triggerLabel(selected) : undefined}
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {loading
                  ? "Loading examiners…"
                  : selected
                    ? triggerLabel(selected)
                    : "Select examiner…"}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,24rem)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Type examiner name…"
                className="h-10"
                value={nameQuery}
                onValueChange={setNameQuery}
              />
              {variant === "marked-scripts" ? (
                <div className="space-y-2 border-b border-border px-2 py-2">
                  {pendingTotal > 0 ? (
                    <button
                      type="button"
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        pendingOnly
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50",
                      )}
                      onClick={() => setPendingOnly((v) => !v)}
                    >
                      Pending ({pendingTotal})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    onClick={() => setDetailSearch((open) => !open)}
                  >
                    <SlidersHorizontal className="size-3.5" aria-hidden />
                    {detailSearch ? "Hide filters" : "More filters"}
                    {!detailSearch && (regionFilter.length > 0 || roleFilter.length > 0) ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {regionFilter.length + roleFilter.length}
                      </span>
                    ) : null}
                  </button>
                  {detailSearch ? (
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <MultiSelectCheckboxDropdown
                        id={`${id}-region`}
                        label="Region"
                        options={regionOptions}
                        selected={regionFilter}
                        onChange={setRegionFilter}
                        allLabel="All regions"
                        disabled={disabled || loading || regionOptions.length === 0}
                        triggerClassName={multiSelectCompactTrigger}
                      />
                      <MultiSelectCheckboxDropdown
                        id={`${id}-role`}
                        label="Role"
                        options={roleOptions}
                        selected={roleFilter}
                        onChange={setRoleFilter}
                        allLabel="All roles"
                        disabled={disabled || loading || roleOptions.length === 0}
                        triggerClassName={multiSelectCompactTrigger}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <CommandList>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {listExaminers.map((examiner) => {
                    const isSelected = examiner.examiner_id === selectedId;
                    return (
                      <CommandItem
                        key={examiner.examiner_id}
                        value={`${examiner.examiner_name} ${examiner.examiner_id}`}
                        onSelect={() => handleSelect(examiner.examiner_id)}
                        className="py-2.5"
                      >
                        <ExaminerPickerRow
                          examiner={examiner}
                          selected={isSelected}
                          variant={variant}
                          showCheck
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
