"use client";

import type { ReactNode } from "react";

import {
  SO_MOBILE_COMMAND_BAR,
  SO_MOBILE_CONTENT_GUTTER,
  SO_MOBILE_PANEL_BLEED,
} from "@/components/examiners/constants";
import {
  officialAccountsCommandBarClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  commandBar?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Master-detail pages: inner card spans full panel width on mobile. */
  flushMobileContent?: boolean;
  /** Desktop master-detail: panel fills remaining viewport; inner panes scroll. */
  fillViewport?: boolean;
};

export function SubjectOfficerPanelShell({
  commandBar,
  children,
  className,
  flushMobileContent = false,
  fillViewport = false,
}: Props) {
  return (
    <div
      className={cn(
        officialAccountsPanelClass,
        SO_MOBILE_PANEL_BLEED,
        fillViewport && "flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      {commandBar ? (
        <div className={cn(officialAccountsCommandBarClass, SO_MOBILE_COMMAND_BAR)}>{commandBar}</div>
      ) : null}
      <div
        className={cn(
          "min-h-0 px-4 py-4 sm:px-5 sm:py-5 lg:flex-1",
          fillViewport && "flex min-h-0 flex-1 flex-col overflow-hidden",
          flushMobileContent
            ? "max-md:px-0 max-md:py-3"
            : cn(SO_MOBILE_CONTENT_GUTTER, "max-md:py-3"),
        )}
      >
        {children}
      </div>
    </div>
  );
}
