"use client";

import type { ReactNode } from "react";

import {
  EXAMINERS_COMMAND_BAR_CLASS,
  EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS,
  SO_MOBILE_COMMAND_BAR,
} from "@/components/examiners/constants";
import { officialAccountsCommandBarRowClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  search: ReactNode;
  discoverActions: ReactNode;
  pageActions: ReactNode;
  selectionBar?: ReactNode;
  filterChips?: ReactNode;
  toolbarLabel: string;
  embedded?: boolean;
  mobileContactLayout?: boolean;
  className?: string;
};

export function ExaminersAdminToolbar({
  search,
  discoverActions,
  pageActions,
  selectionBar,
  filterChips,
  toolbarLabel,
  embedded = false,
  mobileContactLayout = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        embedded ? EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS : EXAMINERS_COMMAND_BAR_CLASS,
        mobileContactLayout && SO_MOBILE_COMMAND_BAR,
        mobileContactLayout &&
          "sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        <div
          className={cn(
            officialAccountsCommandBarRowClass,
            "flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {search}
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={toolbarLabel}>
              {discoverActions}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{pageActions}</div>
        </div>
        {selectionBar}
      </div>
      {filterChips}
    </div>
  );
}
