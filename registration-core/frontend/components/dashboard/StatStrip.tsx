import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatStripItem {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}

interface StatStripProps {
  items: StatStripItem[];
  className?: string;
}

export function StatStrip({ items, className }: StatStripProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-none",
        className
      )}
    >
      <div
        className={cn(
          "grid gap-0",
          items.length === 1 && "grid-cols-1",
          items.length === 2 && "sm:grid-cols-2",
          items.length === 3 && "sm:grid-cols-3",
          items.length === 4 && "sm:grid-cols-2 lg:grid-cols-4",
          items.length >= 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "space-y-1 p-5 md:p-6",
              index > 0 && "border-t border-border sm:border-t-0 sm:border-l",
              item.className
            )}
          >
            <div className="text-sm text-muted-foreground">{item.label}</div>
            <div className="font-mono text-3xl font-medium tracking-tight text-foreground">
              {item.value}
            </div>
            {item.hint ? (
              <div className="text-xs text-muted-foreground">{item.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
