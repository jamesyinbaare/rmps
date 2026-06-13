"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import type { ExportMenuOption } from "@/components/official-accounts-export-menu";
import { ExportFabSpeedDial } from "@/components/export-fab-speed-dial";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Examination } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const SECTION_ID = "examiner-payouts";

const bySubjectBtnClass = cn(
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent text-accent-foreground shadow-md",
  "transition-[filter,box-shadow] hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:pointer-events-none disabled:opacity-50",
);

const standaloneTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

const roleSelectClass = cn(
  officialAccountsCommandBarControlClass,
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30",
);

/** Full-row ratio: exam 2 · role 2 · region 2 · actions 1. */
const toolbarRowClass =
  "grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] items-end gap-3";

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  roleFilter: string;
  onRoleChange: (role: string) => void;
  regionFilter: string;
  onRegionChange: (region: string) => void;
  bySubjectHref: string | null;
  exportOptions: ExportMenuOption[];
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
};

export function ExaminerPayoutsCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  roleFilter,
  onRoleChange,
  regionFilter,
  onRegionChange,
  bySubjectHref,
  exportOptions,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  onExport,
}: Props) {
  const exportBusyKey = exportBusy?.startsWith(`${SECTION_ID}:`)
    ? exportBusy.split(":")[1]
    : null;

  const regionOptions = [
    { value: "", label: "All regions" },
    ...REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
  ];

  const examSelected = examId != null;

  return (
    <div className={cn(officialAccountsCommandBarClass, "overflow-visible")}>
      <div className={toolbarRowClass}>
        <CommandBarBorderField label="Examination" htmlFor={`${SECTION_ID}-exam`} className="min-w-0">
          <SearchableCombobox
            id={`${SECTION_ID}-exam`}
            options={exams.map((ex) => ({
              value: String(ex.id),
              label: formatExamLabel(ex),
            }))}
            value={examId != null ? String(examId) : ""}
            onChange={(v) => onExamChange(v ? Number(v) : null)}
            placeholder="Select examination…"
            searchPlaceholder="Examination…"
            emptyText="No examination found."
            widthClass="w-full"
            truncateTrigger
            triggerClassName={standaloneTriggerClass}
            showAllOption={false}
            disabled={exams.length === 0}
          />
        </CommandBarBorderField>

        <CommandBarBorderField label="Role" htmlFor={`${SECTION_ID}-role`} className="min-w-0">
          <select
            id={`${SECTION_ID}-role`}
            className={roleSelectClass}
            value={roleFilter}
            disabled={!examSelected}
            onChange={(e) => onRoleChange(e.target.value)}
          >
            <option value="">All roles</option>
            {EXAMINER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </CommandBarBorderField>

        <CommandBarBorderField label="Region" htmlFor={`${SECTION_ID}-region`} className="min-w-0">
          <SearchableCombobox
            id={`${SECTION_ID}-region`}
            options={regionOptions}
            value={regionFilter}
            onChange={onRegionChange}
            placeholder="All regions"
            searchPlaceholder="Region…"
            emptyText="No region found."
            widthClass="w-full"
            truncateTrigger
            triggerClassName={standaloneTriggerClass}
            allOptionLabel="All regions"
            disabled={!examSelected}
          />
        </CommandBarBorderField>

        <div
          className="flex min-w-0 items-end justify-end gap-2"
          role="toolbar"
          aria-label="Examiner bank account actions"
        >
          {bySubjectHref ? (
            <Link
              href={bySubjectHref}
              className={cn(
                bySubjectBtnClass,
                "motion-safe:hover:shadow-lg",
                examSelected && "ring-1 ring-accent/35",
              )}
              aria-label="Bank accounts by subject"
              title="Bank accounts by subject"
            >
              <BookOpen className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
          <ExportFabSpeedDial
            options={exportOptions}
            disabled={exportDisabled}
            disabledReason={exportDisabledReason}
            busyKey={exportBusyKey}
            onExport={onExport}
            sectionLabel="Export examiner bank accounts"
          />
        </div>
      </div>
    </div>
  );
}
