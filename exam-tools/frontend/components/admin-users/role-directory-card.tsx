"use client";

import Link from "next/link";

import { adminUserBtnPrimary, adminUserBtnSecondary } from "@/components/admin-user-modal-shell";

type RoleDirectoryCardProps = {
  id: string;
  title: string;
  description: string;
  loginHint: string;
  accountCount: number | null;
  countLoading?: boolean;
  onManage: () => void;
  onCreate: () => void;
  manageHref?: string;
};

export function RoleDirectoryCard({
  id,
  title,
  description,
  loginHint,
  accountCount,
  countLoading,
  onManage,
  onCreate,
  manageHref,
}: RoleDirectoryCardProps) {
  const countLabel =
    countLoading || accountCount === null
      ? "…"
      : `${accountCount} account${accountCount === 1 ? "" : "s"}`;

  return (
    <article
      id={id}
      className="scroll-mt-24 flex flex-col rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-card-foreground">{title}</h3>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {loginHint}
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{description}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{countLabel}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {manageHref ? (
          <Link href={manageHref} className={adminUserBtnPrimary}>
            Manage accounts
          </Link>
        ) : (
          <button type="button" onClick={onManage} className={adminUserBtnPrimary}>
            Manage accounts
          </button>
        )}
        <button type="button" onClick={onCreate} className={adminUserBtnSecondary}>
          Create account
        </button>
      </div>
    </article>
  );
}
