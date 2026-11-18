import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionLabel({ children, action, className }: SectionLabelProps) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-2", className)}>
      <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {children}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
