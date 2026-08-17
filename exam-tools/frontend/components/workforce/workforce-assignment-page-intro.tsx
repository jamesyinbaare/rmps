"use client";

import Link from "next/link";

import { OfficialAccountsPageIntro, OfficialAccountsExamMeta } from "@/components/official-accounts-page-intro";
import {
  WorkforceOverflowMenu,
  workforceMenuItemClass,
} from "@/components/workforce/workforce-overflow-menu";
import type { Examination } from "@/lib/api";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";

type Props = {
  config: WorkforceKindConfig;
  description: string;
  exam: Examination | null;
  formatExamLabel: (exam: Examination) => string;
  showAdminLinks?: boolean;
  showRatesLink?: boolean;
  showManualAllocationLink?: boolean;
  showAssignmentsOverviewLink?: boolean;
};

export function WorkforceAssignmentPageIntro({
  config,
  description,
  exam,
  formatExamLabel,
  showAdminLinks = false,
  showRatesLink = false,
  showManualAllocationLink = false,
  showAssignmentsOverviewLink = false,
}: Props) {
  const links = [
    showManualAllocationLink
      ? { href: config.adminManualAllocationPath, label: "Bulk assignment" }
      : null,
    showAssignmentsOverviewLink
      ? { href: config.adminAssignmentsPath, label: "Assignments overview" }
      : null,
    showAdminLinks ? { href: config.adminRosterPath, label: "View roster" } : null,
    showRatesLink ? { href: config.adminRatesPath, label: "Set rates" } : null,
  ].filter((item): item is { href: string; label: string } => item != null);

  return (
    <OfficialAccountsPageIntro
      description={description}
      meta={exam ? <OfficialAccountsExamMeta>{formatExamLabel(exam)}</OfficialAccountsExamMeta> : null}
      actions={
        links.length > 0 ? (
          <WorkforceOverflowMenu label="More" ariaLabel="Page links">
            {(close) =>
              links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={workforceMenuItemClass}
                  onClick={close}
                >
                  {item.label}
                </Link>
              ))
            }
          </WorkforceOverflowMenu>
        ) : undefined
      }
    />
  );
}
