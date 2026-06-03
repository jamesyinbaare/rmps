"use client";

import Link from "next/link";
import { ClipboardList, Landmark, MapPin } from "lucide-react";

import { BANK_ACCOUNTS_LABEL } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const cardLinkClass =
  "group flex gap-2.5 rounded-lg border p-2.5 transition-[border-color,box-shadow,background-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card";

const cardIconClass = "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors";

type Props = {
  href: string;
  active: boolean;
  onNavigate?: () => void;
};

/** Sidebar module card — allowances area, visually separate from exam operations. */
export function OfficialAccountsNavLink({ href, active, onNavigate }: Props) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        cardLinkClass,
        "focus-visible:ring-success/40",
        active
          ? "border-success/45 bg-card shadow-sm ring-1 ring-success/15"
          : "border-border/80 bg-muted/15 hover:border-success/30 hover:bg-card",
      )}
    >
      <span
        className={cn(
          cardIconClass,
          active
            ? "bg-success text-success-foreground"
            : "bg-muted/80 text-muted-foreground group-hover:bg-success/10 group-hover:text-success",
        )}
      >
        <Landmark className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">{BANK_ACCOUNTS_LABEL}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Allowances & bank info</span>
      </span>
    </Link>
  );
}

type SubNavProps = {
  href: string;
  active: boolean;
  onNavigate?: () => void;
};

/** Secondary item under Allowances (e.g. attendance sheets). */
export function AllowancesSubNavLink({ href, active, onNavigate }: SubNavProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        cardLinkClass,
        "focus-visible:ring-success/40",
        active
          ? "border-success/45 bg-card shadow-sm ring-1 ring-success/15"
          : "border-border/80 bg-muted/15 hover:border-success/30 hover:bg-card",
      )}
    >
      <span
        className={cn(
          cardIconClass,
          active
            ? "bg-success text-success-foreground"
            : "bg-muted/80 text-muted-foreground group-hover:bg-success/10 group-hover:text-success",
        )}
      >
        <ClipboardList className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">Attendance sheets</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Upload centre attendance</span>
      </span>
    </Link>
  );
}

/** Route planning item — separate from allowances (primary accent). */
export function CentreLocationNavLink({ href, active, onNavigate }: SubNavProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        cardLinkClass,
        "focus-visible:ring-ring/40",
        active
          ? "border-primary/45 bg-card shadow-sm ring-1 ring-primary/15"
          : "border-border/80 bg-muted/15 hover:border-primary/30 hover:bg-card",
      )}
    >
      <span
        className={cn(
          cardIconClass,
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
        )}
      >
        <MapPin className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">Centre location</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          For planning material and officer dispatch
        </span>
      </span>
    </Link>
  );
}

export function OfficialAccountsNavSection({
  children,
  title = "Allowances",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="mt-3.5 space-y-2 border-t border-border pt-3.5">
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
