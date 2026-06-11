"use client";

import {
  officialAccountsBtnSecondary,
  officialAccountsPanelFooterClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
  recordLabel?: string;
  /** When set, shows preset select + optional custom size input (bare numbers, size before nav). */
  showCustomPageSizeInput?: boolean;
  customPageSizeInput?: string;
  onPageSizeSelectChange?: (value: string) => void;
  onCustomPageSizeChange?: (value: string) => void;
  onCustomPageSizeBlur?: () => void;
  maxCustomPageSize?: number;
};

export function OfficialAccountsPagination({
  page,
  pageSize,
  total,
  busy = false,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  className,
  recordLabel = "record",
  showCustomPageSizeInput,
  customPageSizeInput,
  onPageSizeSelectChange,
  onCustomPageSizeChange,
  onCustomPageSizeBlur,
  maxCustomPageSize = 5000,
}: Props) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const showPager = total > pageSize;
  const plural = total === 1 ? "" : "s";
  const customSizeInPresets = pageSizeOptions.includes(pageSize);

  return (
    <div className={cn(officialAccountsPanelFooterClass, "shrink-0", className)}>
      <p className="text-muted-foreground">
        {showPager ? (
          <>
            Page {page} of {totalPages.toLocaleString()} · Showing {pageStart}–{pageEnd} of{" "}
            {total.toLocaleString()}
          </>
        ) : (
          <>
            {total.toLocaleString()} {recordLabel}
            {plural}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeSelectChange ? (
          <>
            <select
              className="min-h-9 rounded-md border border-input-border bg-input px-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              value={String(pageSize)}
              disabled={busy}
              aria-label="Page size"
              onChange={(e) => onPageSizeSelectChange(e.target.value)}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
              {!customSizeInPresets ? (
                <option key={`size-${pageSize}`} value={String(pageSize)}>
                  {pageSize}
                </option>
              ) : null}
              <option value="custom">Custom</option>
            </select>
            {showCustomPageSizeInput ? (
              <input
                type="number"
                min={1}
                max={maxCustomPageSize}
                className="min-h-9 w-20 rounded-md border border-input-border bg-input px-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                value={customPageSizeInput ?? String(pageSize)}
                disabled={busy}
                aria-label="Custom page size"
                onChange={(e) => onCustomPageSizeChange?.(e.target.value)}
                onBlur={() => onCustomPageSizeBlur?.()}
              />
            ) : null}
          </>
        ) : (
          <select
            className="min-h-9 rounded-md border border-input-border bg-input px-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            value={String(pageSize)}
            disabled={busy}
            aria-label="Rows per page"
            onChange={(e) => onPageSizeChange(Number.parseInt(e.target.value, 10))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        )}
        {showPager ? (
          <>
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={page <= 1 || busy}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={page >= totalPages || busy}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
