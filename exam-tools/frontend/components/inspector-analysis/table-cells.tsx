import { cn } from "@/lib/utils";

export function numCell(value: number) {
  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

export function moneyCell(value: string) {
  const n = Number(value);
  return (
    <span className="tabular-nums">
      {Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
    </span>
  );
}

export function loadingCell() {
  return <span className="inline-block h-4 w-8 animate-pulse rounded bg-muted-foreground/20" aria-hidden />;
}

export function varianceCellClass(variance: number): string {
  if (variance > 0) return "rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive";
  if (variance < 0) return "rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300";
  return "rounded-md bg-success/10 px-2 py-0.5 font-medium text-success";
}

export function varianceLabel(variance: number): string {
  if (variance === 0) return "0";
  if (variance > 0) return `+${variance}`;
  return String(variance);
}

export function varianceCell(value: number) {
  return <span className={cn("tabular-nums", varianceCellClass(value))}>{varianceLabel(value)}</span>;
}

export function moneyVarianceCell(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = n > 0 ? "+" : "";
  return (
    <span className={cn("tabular-nums", varianceCellClass(n > 0 ? 1 : n < 0 ? -1 : 0))}>
      {prefix}
      {formatted}
    </span>
  );
}
