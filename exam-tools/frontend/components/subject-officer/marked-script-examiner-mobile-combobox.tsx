"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  filterMarkedScriptExaminers,
  formatMarkedScriptExaminerOptionLabel,
} from "@/components/subject-officer/marked-script-examiner-picker";
import type { ExaminerTypeApi, MarkedScriptReturnExaminerOption } from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const comboboxCompactProps = {
  widthClass: "w-full mt-0.5",
  triggerClassName: "h-9 min-h-9 py-0",
  truncateTrigger: true as const,
};

type Props = {
  examiners: MarkedScriptReturnExaminerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

export function MarkedScriptExaminerMobileCombobox({
  examiners,
  selectedId,
  onSelect,
  loading = false,
  disabled = false,
  className,
}: Props) {
  const [nameQuery, setNameQuery] = useState("");
  const [detailSearch, setDetailSearch] = useState(false);
  const [regionFilter, setRegionFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  const pendingTotal = useMemo(
    () => examiners.filter((e) => e.pending_count > 0).length,
    [examiners],
  );

  const roleOptions = useMemo(() => {
    const types = [...new Set(examiners.map((e) => e.examiner_type))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return types.map((value) => ({
      value,
      label: EXAMINER_TYPE_LABELS[value as ExaminerTypeApi] ?? value,
    }));
  }, [examiners]);

  const narrowedExaminers = useMemo(
    () =>
      filterMarkedScriptExaminers(examiners, nameQuery, {
        pendingOnly,
        region: detailSearch ? regionFilter : "",
        role: detailSearch ? roleFilter : "",
        nameOnly: true,
      }),
    [detailSearch, examiners, nameQuery, pendingOnly, regionFilter, roleFilter],
  );

  const hasNameQuery = nameQuery.trim().length > 0;
  const hasDetailFilters =
    detailSearch && (regionFilter.length > 0 || roleFilter.length > 0 || pendingOnly);
  const shouldListOptions = hasNameQuery || hasDetailFilters;

  const comboboxOptions = useMemo(() => {
    if (!shouldListOptions) {
      if (!selectedId) return [];
      const selected = examiners.find((e) => e.examiner_id === selectedId);
      return selected
        ? [{ value: selected.examiner_id, label: formatMarkedScriptExaminerOptionLabel(selected) }]
        : [];
    }

    const options = narrowedExaminers.map((examiner) => ({
      value: examiner.examiner_id,
      label: formatMarkedScriptExaminerOptionLabel(examiner),
    }));

    if (selectedId && !options.some((o) => o.value === selectedId)) {
      const selected = examiners.find((e) => e.examiner_id === selectedId);
      if (selected) {
        options.unshift({
          value: selected.examiner_id,
          label: formatMarkedScriptExaminerOptionLabel(selected),
        });
      }
    }

    return options;
  }, [examiners, narrowedExaminers, selectedId, shouldListOptions]);

  const emptyText = hasNameQuery
    ? "No examiners found."
    : hasDetailFilters
      ? "No examiners match these filters."
      : "Type examiner name to search.";

  return (
    <div className={cn("space-y-2", className)}>
      {detailSearch ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={compactLabelClass} htmlFor="msr-examiner-region">
              Region
            </label>
            <SearchableCombobox
              id="msr-examiner-region"
              options={REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
              value={regionFilter}
              onChange={setRegionFilter}
              placeholder="All regions"
              searchPlaceholder="Search region…"
              allOptionLabel="All regions"
              showAllOption
              disabled={disabled || loading}
              {...comboboxCompactProps}
            />
          </div>
          <div className="min-w-0">
            <label className={compactLabelClass} htmlFor="msr-examiner-role">
              Role
            </label>
            <SearchableCombobox
              id="msr-examiner-role"
              options={roleOptions}
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="All roles"
              searchPlaceholder="Search role…"
              allOptionLabel="All roles"
              showAllOption
              disabled={disabled || loading || roleOptions.length === 0}
              {...comboboxCompactProps}
            />
          </div>
          {pendingTotal > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 px-0.5 text-xs text-muted-foreground sm:col-span-2">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                disabled={disabled || loading}
              />
              Pending only ({pendingTotal})
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-0">
        <label className={compactLabelClass} htmlFor="msr-examiner">
          Examiner
        </label>
        <p className="mb-1 text-[11px] leading-snug text-muted-foreground">
          Search and select an examiner.
        </p>
        <SearchableCombobox
          id="msr-examiner"
          options={comboboxOptions}
          value={selectedId ?? ""}
          onChange={onSelect}
          onSearchChange={setNameQuery}
          placeholder={loading ? "Loading examiners…" : "Select examiner…"}
          searchPlaceholder="Type examiner name…"
          emptyText={emptyText}
          showAllOption={false}
          disabled={disabled || loading}
          {...comboboxCompactProps}
        />
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        onClick={() => {
          setDetailSearch((open) => {
            if (open) {
              setRegionFilter("");
              setRoleFilter("");
              setPendingOnly(false);
            }
            return !open;
          });
        }}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {detailSearch ? "Hide detail search" : "Detail search"}
      </button>
    </div>
  );
}
