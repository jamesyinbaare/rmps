"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelfRegionMarkingConfirmDialog } from "@/components/scripts-allocation/self-region-marking-confirm-dialog";
import { cn } from "@/lib/utils";
import { REGION_OPTIONS } from "@/lib/school-enums";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const REGION_MULTI_OPTIONS: MultiSelectCheckboxOption[] = REGION_OPTIONS.map((r) => ({
  value: r.value,
  label: r.label,
}));

type Props = {
  rules: Record<string, string[]>;
  solveOrder: string[];
  disabled?: boolean;
  onToggle: (examinerRegion: string, scriptRegion: string, checked: boolean) => void;
  onRegionRuleChange: (examinerRegion: string, scriptRegions: string[]) => void;
  onRemoveRegionRule: (examinerRegion: string) => void;
  onMoveRegionUp: (region: string) => void;
  onMoveRegionDown: (region: string) => void;
};

function isChecked(rules: Record<string, string[]>, row: string, col: string): boolean {
  return (rules[row] ?? []).includes(col);
}

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

type SelfRegionPrompt =
  | {
      kind: "rule";
      examinerRegion: string;
      scriptRegions: string[];
    }
  | {
      kind: "toggle";
      examinerRegion: string;
      scriptRegion: string;
      checked: boolean;
    };

export function RegionCrossMarkingMatrix({
  rules,
  solveOrder,
  disabled = false,
  onToggle,
  onRegionRuleChange,
  onRemoveRegionRule,
  onMoveRegionUp,
  onMoveRegionDown,
}: Props) {
  const [addRegionDraft, setAddRegionDraft] = useState("");
  const [showOverviewMatrix, setShowOverviewMatrix] = useState(false);
  const [selfRegionPrompt, setSelfRegionPrompt] = useState<SelfRegionPrompt | null>(null);

  const configuredRegionKeys = useMemo(
    () => Object.keys(rules).filter((key) => REGION_OPTIONS.some((r) => r.value === key)),
    [rules],
  );

  const activeRowsWithTargets = useMemo(
    () => configuredRegionKeys.filter((row) => (rules[row] ?? []).length > 0),
    [configuredRegionKeys, rules],
  );

  const markedByColumn = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rowKey of configuredRegionKeys) {
      for (const col of rules[rowKey] ?? []) {
        const list = map.get(col) ?? [];
        list.push(regionLabel(rowKey));
        map.set(col, list);
      }
    }
    return map;
  }, [configuredRegionKeys, rules]);

  const orderIndex = useMemo(() => {
    const idx = new Map<string, number>();
    solveOrder.forEach((r, i) => idx.set(r, i));
    return idx;
  }, [solveOrder]);

  const sortedConfiguredRows = useMemo(() => {
    return [...configuredRegionKeys].sort((a, b) => {
      const ia = orderIndex.get(a) ?? 999;
      const ib = orderIndex.get(b) ?? 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
  }, [configuredRegionKeys, orderIndex]);

  const availableToAdd = useMemo(
    () => REGION_OPTIONS.filter((r) => !configuredRegionKeys.includes(r.value)),
    [configuredRegionKeys],
  );

  function handleAddRegion() {
    const region = addRegionDraft.trim();
    if (!region || configuredRegionKeys.includes(region)) return;
    onRegionRuleChange(region, rules[region] ?? []);
    setAddRegionDraft("");
  }

  function selectAllExceptOwn(examinerRegion: string) {
    onRegionRuleChange(
      examinerRegion,
      REGION_OPTIONS.map((r) => r.value).filter((v) => v !== examinerRegion),
    );
  }

  function isAddingSelfRegion(examinerRegion: string, scriptRegions: string[]): boolean {
    const prev = rules[examinerRegion] ?? [];
    return scriptRegions.includes(examinerRegion) && !prev.includes(examinerRegion);
  }

  function handleRegionRuleChange(examinerRegion: string, scriptRegions: string[]) {
    if (isAddingSelfRegion(examinerRegion, scriptRegions)) {
      setSelfRegionPrompt({ kind: "rule", examinerRegion, scriptRegions });
      return;
    }
    onRegionRuleChange(examinerRegion, scriptRegions);
  }

  function handleToggle(examinerRegion: string, scriptRegion: string, checked: boolean) {
    if (checked && examinerRegion === scriptRegion && !(rules[examinerRegion] ?? []).includes(scriptRegion)) {
      setSelfRegionPrompt({ kind: "toggle", examinerRegion, scriptRegion, checked });
      return;
    }
    onToggle(examinerRegion, scriptRegion, checked);
  }

  function confirmSelfRegionPrompt() {
    if (!selfRegionPrompt) return;
    if (selfRegionPrompt.kind === "rule") {
      onRegionRuleChange(selfRegionPrompt.examinerRegion, selfRegionPrompt.scriptRegions);
    } else {
      onToggle(selfRegionPrompt.examinerRegion, selfRegionPrompt.scriptRegion, selfRegionPrompt.checked);
    }
    setSelfRegionPrompt(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Add one rule per <strong className="font-medium text-foreground">examiner home region</strong>, then choose which{" "}
        <strong className="font-medium text-foreground">script school regions</strong> they may mark. Order matters for
        regional greedy and decomposed solves — regions at the top claim envelopes first.
      </p>

      {activeRowsWithTargets.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted/15 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">Who marks each script region</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {[...markedByColumn.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([scriptRegion, markers]) => (
                <li key={scriptRegion}>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <span className="font-medium">{regionLabel(scriptRegion)}</span>
                    <span className="text-muted-foreground">←</span>
                    <span>{markers.join(", ")}</span>
                  </Badge>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <SearchableCombobox
            options={availableToAdd}
            value={addRegionDraft}
            onChange={setAddRegionDraft}
            placeholder={availableToAdd.length === 0 ? "All regions added" : "Add examiner home region…"}
            searchPlaceholder="Search region…"
            showAllOption={false}
            disabled={disabled || availableToAdd.length === 0}
            widthClass="w-full max-w-sm"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !addRegionDraft || configuredRegionKeys.includes(addRegionDraft)}
          onClick={handleAddRegion}
        >
          <Plus className="mr-1 size-3.5" aria-hidden />
          Add rule
        </Button>
      </div>

      {sortedConfiguredRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No region rules yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Example: Ashanti examiners may mark scripts from Greater Accra and Eastern. Add Ashanti above, then pick those
            script regions.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedConfiguredRows.map((examinerRegion, index) => {
            const selected = rules[examinerRegion] ?? [];
            const hasSelf = selected.includes(examinerRegion);
            const label = regionLabel(examinerRegion);
            return (
              <li
                key={examinerRegion}
                className={cn(
                  "rounded-lg border border-border bg-card p-4 shadow-sm",
                  selected.length === 0 && "border-dashed",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        {index + 1}
                      </Badge>
                      <h4 className="text-sm font-semibold text-foreground">{label} examiners</h4>
                      {selected.length === 0 ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">Pick script regions below</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">May mark scripts from</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={disabled || index === 0}
                      onClick={() => onMoveRegionUp(examinerRegion)}
                      aria-label={`Move ${label} up in solve order`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={disabled || index === sortedConfiguredRows.length - 1}
                      onClick={() => onMoveRegionDown(examinerRegion)}
                      aria-label={`Move ${label} down in solve order`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={disabled}
                      onClick={() => onRemoveRegionRule(examinerRegion)}
                      aria-label={`Remove ${label} rule`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 max-w-md">
                  <MultiSelectCheckboxDropdown
                    options={REGION_MULTI_OPTIONS}
                    selected={selected}
                    onChange={(next) => handleRegionRuleChange(examinerRegion, next)}
                    allLabel="Select script regions…"
                    disabled={disabled}
                  />
                </div>

                {selected.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.map((scriptRegion) => {
                      const isSelf = scriptRegion === examinerRegion;
                      return (
                        <Badge
                          key={scriptRegion}
                          variant={isSelf ? "outline" : "secondary"}
                          className={cn(isSelf && "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100")}
                        >
                          {regionLabel(scriptRegion)}
                          {isSelf ? " (own region)" : null}
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}

                {hasSelf ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    Self-region marking is on — {label} examiners may mark scripts from schools in {label}.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => selectAllExceptOwn(examinerRegion)}
                  >
                    All regions except {label}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || selected.length === 0}
                    onClick={() => onRegionRuleChange(examinerRegion, [])}
                  >
                    Clear selections
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details
        className="rounded-lg border border-border bg-muted/10"
        open={showOverviewMatrix}
        onToggle={(e) => setShowOverviewMatrix((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          {showOverviewMatrix ? "Hide" : "Show"} full overview matrix
        </summary>
        <div className="border-t border-border px-2 pb-3 pt-2">
          <p className="mb-2 px-1 text-[11px] text-muted-foreground">
            Grid view for quick scanning. Diagonal cells require confirmation — they allow marking in the examiner&apos;s
            own region.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/80">
                  <th className="sticky left-0 z-10 bg-muted/95 px-2 py-2 text-left font-semibold">Examiner region</th>
                  {REGION_OPTIONS.map((col) => (
                    <th key={col.value} className="min-w-[4rem] px-1 py-2 text-center align-bottom font-medium">
                      <span className="block leading-tight">{col.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REGION_OPTIONS.map((row) => (
                  <tr
                    key={row.value}
                    className={cn(
                      "border-b border-border/60",
                      configuredRegionKeys.includes(row.value) && "bg-primary/5",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium">{row.label}</td>
                    {REGION_OPTIONS.map((col) => {
                      const checked = isChecked(rules, row.value, col.value);
                      const diagonal = row.value === col.value;
                      return (
                        <td key={col.value} className="px-1 py-1 text-center">
                          <label
                            className={cn(
                              "inline-flex cursor-pointer items-center justify-center rounded p-1",
                              diagonal && checked && "bg-amber-500/10",
                            )}
                            title={
                              diagonal
                                ? "Examiners will mark scripts from their own region"
                                : `${row.label} → ${col.label}`
                            }
                          >
                            <input
                              type="checkbox"
                              className={cn("size-3.5", inputFocusRing)}
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => handleToggle(row.value, col.value, e.target.checked)}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <SelfRegionMarkingConfirmDialog
        open={selfRegionPrompt != null}
        regionLabel={
          selfRegionPrompt ? regionLabel(selfRegionPrompt.examinerRegion) : ""
        }
        busy={disabled}
        onCancel={() => setSelfRegionPrompt(null)}
        onConfirm={confirmSelfRegionPrompt}
      />
    </div>
  );
}
