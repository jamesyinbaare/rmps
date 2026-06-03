"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const borderLabelClass =
  "pointer-events-none absolute left-2.5 top-2 z-10 -translate-y-1/2 bg-input px-1 text-xs font-medium leading-none text-muted-foreground";

type Props = {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

/** Outlined field — label sits on the top border of the control. */
export function CommandBarBorderField({ label, htmlFor, className, children }: Props) {
  return (
    <div className={cn("relative min-w-0 pt-2", className)}>
      <label htmlFor={htmlFor} className={borderLabelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}
