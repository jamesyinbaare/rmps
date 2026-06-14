"use client";

import Link from "next/link";

import { OfficialAccountsPageIntro, OfficialAccountsExamMeta } from "@/components/official-accounts-page-intro";
import { Button } from "@/components/ui/button";
import type { Examination } from "@/lib/api";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";

type Props = {
  config: WorkforceKindConfig;
  description: string;
  exam: Examination | null;
  formatExamLabel: (exam: Examination) => string;
  showAdminLinks?: boolean;
  showRatesLink?: boolean;
};

export function WorkforceAssignmentPageIntro({
  config,
  description,
  exam,
  formatExamLabel,
  showAdminLinks = false,
  showRatesLink = false,
}: Props) {
  const showActions = showAdminLinks || showRatesLink;

  return (
    <OfficialAccountsPageIntro
      description={description}
      meta={exam ? <OfficialAccountsExamMeta>{formatExamLabel(exam)}</OfficialAccountsExamMeta> : null}
      actions={
        showActions ? (
          <div className="hidden w-full flex-col gap-2 md:flex md:flex-row md:flex-wrap md:justify-end">
            {showAdminLinks ? (
              <Button type="button" asChild variant="secondary" className={officialAccountsBtnSecondary}>
                <Link href={config.adminRosterPath}>View roster</Link>
              </Button>
            ) : null}
            {showRatesLink ? (
              <Button type="button" asChild variant="outline">
                <Link href={config.adminRatesPath}>Set rates</Link>
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
