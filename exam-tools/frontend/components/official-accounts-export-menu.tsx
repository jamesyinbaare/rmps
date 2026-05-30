"use client";

import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AdminExamCentreOfficialsExportLayout } from "@/lib/api";
import {
  officialAccountsBtnPrimary,
  officialAccountsBtnPrimaryToolbar,
  officialAccountsBtnSecondary,
  officialAccountsBtnSecondaryToolbar,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export type ExportMenuOption = {
  layout: AdminExamCentreOfficialsExportLayout;
  label: string;
  description?: string;
  primary?: boolean;
};

type Props = {
  options: ExportMenuOption[];
  recordCount: number;
  centreCount: number | null;
  disabled: boolean;
  disabledReason?: string;
  exportBusy: string | null;
  sectionId: string;
  onExport: (layout: AdminExamCentreOfficialsExportLayout) => void;
  /** Use standard toolbar button sizing (command bar). */
  toolbar?: boolean;
  hideSummary?: boolean;
  footnote?: string;
};

export function OfficialAccountsExportMenu({
  options,
  recordCount,
  centreCount,
  disabled,
  disabledReason,
  exportBusy,
  sectionId,
  onExport,
  toolbar = false,
  hideSummary = false,
  footnote,
}: Props) {
  const [open, setOpen] = useState(false);
  const primary = options.find((o) => o.primary) ?? options[0];
  const secondary = options.filter((o) => o !== primary);

  const summaryParts: string[] = [];
  if (recordCount > 0) {
    summaryParts.push(`${recordCount.toLocaleString()} record${recordCount === 1 ? "" : "s"}`);
  }
  if (centreCount != null && centreCount > 0) {
    summaryParts.push(`${centreCount.toLocaleString()} centre${centreCount === 1 ? "" : "s"}`);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : null;
  const showSummary = !hideSummary && summary;

  const btnPrimary = toolbar ? officialAccountsBtnPrimaryToolbar : officialAccountsBtnPrimary;
  const btnSecondary = toolbar ? officialAccountsBtnSecondaryToolbar : officialAccountsBtnSecondary;

  const busyLayout = exportBusy?.startsWith(`${sectionId}:`)
    ? (exportBusy.split(":")[1] as AdminExamCentreOfficialsExportLayout)
    : null;

  if (options.length === 0) return null;

  if (options.length === 1 && primary) {
    const busy = busyLayout === primary.layout;
    return (
      <div className={cn("flex flex-col gap-1", toolbar ? "items-stretch" : "items-stretch sm:items-end")}>
        <button
          type="button"
          className={cn(btnPrimary, "inline-flex items-center justify-center gap-2")}
          disabled={disabled || !!exportBusy}
          title={disabled ? disabledReason : footnote}
          onClick={() => onExport(primary.layout)}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          {busy ? "Preparing export…" : primary.label}
        </button>
        {showSummary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
        {disabled && disabledReason && !toolbar ? (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>
    );
  }

  const primaryBusy = busyLayout === primary?.layout;

  return (
    <div className={cn("flex flex-col gap-1", toolbar ? "items-stretch" : "items-stretch sm:items-end")}>
      <div className="flex flex-wrap gap-2">
        {primary ? (
          <button
            type="button"
            className={cn(btnPrimary, "inline-flex items-center justify-center gap-2")}
            disabled={disabled || !!exportBusy}
            title={disabled ? disabledReason : footnote}
            onClick={() => onExport(primary.layout)}
          >
            <Download className="size-4 shrink-0" aria-hidden />
            {primaryBusy ? "Preparing export…" : primary.label}
          </button>
        ) : null}
        {secondary.length > 0 ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(btnSecondary, "inline-flex items-center justify-center gap-1.5")}
                disabled={disabled || !!exportBusy}
                aria-label="More export options"
              >
                More
                <ChevronDown className="size-4" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              {footnote ? (
                <p className="mb-2 px-2 text-xs text-muted-foreground">{footnote}</p>
              ) : null}
              <p className="mb-2 px-2 text-xs text-muted-foreground">
                {!hideSummary && summary ? summary : "Choose export format"}
              </p>
              <ul className="flex flex-col gap-0.5">
                {secondary.map((opt) => {
                  const busy = busyLayout === opt.layout;
                  return (
                    <li key={opt.layout}>
                      <button
                        type="button"
                        className="flex w-full flex-col rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                        disabled={disabled || !!exportBusy}
                        onClick={() => {
                          setOpen(false);
                          onExport(opt.layout);
                        }}
                      >
                        <span className="font-medium">{busy ? "Preparing…" : opt.label}</span>
                        {opt.description ? (
                          <span className="text-xs text-muted-foreground">{opt.description}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {showSummary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
      {disabled && disabledReason && !toolbar ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
    </div>
  );
}
