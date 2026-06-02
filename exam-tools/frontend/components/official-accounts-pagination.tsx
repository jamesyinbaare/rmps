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
}: Props) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const showPager = total > pageSize;
  const plural = total === 1 ? "" : "s";

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
      </div>
    </div>
  );
}
