"use client";

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
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
};

type DataTableProps<TData> = {
  table: TanstackTable<TData>;
  emptyMessage?: string;
  /** When false, no footer row is rendered even if columns define `footer`. */
  showFooter?: boolean;
};

function metaClasses(
  columnMeta: unknown,
  key: keyof DataTableColumnMeta,
): string | undefined {
  if (!columnMeta || typeof columnMeta !== "object") return undefined;
  return (columnMeta as DataTableColumnMeta)[key];
}

export function DataTable<TData>({
  table,
  emptyMessage = "No results.",
  showFooter = true,
}: DataTableProps<TData>) {
  const colCount = table.getAllColumns().length;
  const hasFooter = showFooter && table.getAllColumns().some((c) => c.columnDef.footer != null);

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "align-top leading-tight whitespace-normal",
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
                      aria-label={
                        typeof header.column.columnDef.header === "string"
                          ? `Sort by ${header.column.columnDef.header}`
                          : "Sort column"
                      }
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
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "align-top text-sm",
                      metaClasses(cell.column.columnDef.meta, "cellClassName"),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
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
