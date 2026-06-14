"use client";

import { flexRender, type Header, type Row, type Table as TanstackTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Optional per-column backgrounds / borders (e.g. banded script-control columns). */
export type DataTableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
  footerClassName?: string;
  /** Visible label for the sort button when `header` is not a plain string */
  sortAriaLabel?: string;
  /** Sticky columns need solid backgrounds when striped so scrolled cells do not show through */
  stickyOpaque?: boolean;
};

type DataTableProps<TData> = {
  table: TanstackTable<TData>;
  emptyMessage?: string;
  /** When false, no footer row is rendered even if columns define `footer`. */
  showFooter?: boolean;
  /** Alternate row background; body cells use `bg-inherit` so row color shows through (pair with sticky `bg-inherit` in column meta). */
  striped?: boolean;
  onRowClick?: (row: TData) => void;
  /** Keep column headers visible while scrolling the table body. */
  stickyHeader?: boolean;
  /** Wrapper around the table element. */
  className?: string;
  /** Applied to each header row. */
  headerRowClassName?: string;
  /** Default classes for every header cell (column meta may extend). */
  headerCellClassName?: string;
};

function metaClasses(
  columnMeta: unknown,
  key: keyof DataTableColumnMeta,
): string | undefined {
  if (!columnMeta || typeof columnMeta !== "object") return undefined;
  const value = (columnMeta as DataTableColumnMeta)[key];
  return typeof value === "string" ? value : undefined;
}

function sortButtonAriaLabel<TData>(header: Header<TData, unknown>): string {
  const meta = header.column.columnDef.meta;
  if (meta && typeof meta === "object" && "sortAriaLabel" in meta) {
    const label = (meta as DataTableColumnMeta).sortAriaLabel;
    if (typeof label === "string" && label.length) return label;
  }
  const h = header.column.columnDef.header;
  return typeof h === "string" ? `Sort by ${h}` : "Sort column";
}

export function DataTable<TData>({
  table,
  emptyMessage = "No results.",
  showFooter = true,
  striped = false,
  onRowClick,
  stickyHeader = false,
  className,
  headerRowClassName,
  headerCellClassName,
}: DataTableProps<TData>) {
  const colCount = table.getAllColumns().length;
  const hasFooter = showFooter && table.getAllColumns().some((c) => c.columnDef.footer != null);

  return (
    <div className={cn("rounded-md border border-border", className)}>
      <Table>
        <TableHeader className={cn(stickyHeader && "sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]")}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className={cn("border-b border-border hover:bg-transparent", headerRowClassName)}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "h-auto align-middle whitespace-nowrap",
                    stickyHeader && "bg-inherit",
                    headerCellClassName,
                    metaClasses(header.column.columnDef.meta, "headerClassName"),
                  )}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className={cn(
                        "-ml-2 inline-flex items-start gap-1 rounded-md px-2 py-1 text-left text-sm font-medium hover:bg-muted/80",
                        header.column.getIsSorted() && "text-foreground",
                      )}
                      aria-label={sortButtonAriaLabel(header)}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="size-4 shrink-0 opacity-70" aria-hidden />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="size-4 shrink-0 opacity-70" aria-hidden />
                      ) : (
                        <ArrowUpDown className="size-4 shrink-0 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className="text-inherit">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row: Row<TData>) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className={cn(
                  striped ? (row.index % 2 === 0 ? "bg-card" : "bg-muted/30") : undefined,
                  onRowClick && "cursor-pointer hover:bg-muted/50",
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const stickyOpaque = Boolean(
                    cell.column.columnDef.meta &&
                      typeof cell.column.columnDef.meta === "object" &&
                      (cell.column.columnDef.meta as DataTableColumnMeta).stickyOpaque,
                  );
                  return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "align-top text-sm",
                      metaClasses(cell.column.columnDef.meta, "cellClassName"),
                      striped &&
                        (stickyOpaque
                          ? row.index % 2 === 0
                            ? "bg-card"
                            : "bg-muted"
                          : "bg-inherit"),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {hasFooter ? (
          <TableFooter>
            {table.getFooterGroups().map((footerGroup) => (
              <TableRow key={footerGroup.id}>
                {footerGroup.headers.map((header) => (
                  <TableCell
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      "align-top text-sm",
                      metaClasses(header.column.columnDef.meta, "footerClassName"),
                    )}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
