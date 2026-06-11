"use client";

import type { ReactNode } from "react";

import {
  officialAccountsCommandBarClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  commandBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SubjectOfficerPanelShell({ commandBar, children, className }: Props) {
  return (
    <div className={cn(officialAccountsPanelClass, className)}>
      {commandBar ? <div className={officialAccountsCommandBarClass}>{commandBar}</div> : null}
      <div className="min-h-0 flex-1 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </div>
  );
}
