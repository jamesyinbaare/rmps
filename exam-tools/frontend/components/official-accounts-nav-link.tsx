"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";

import { cn } from "@/lib/utils";

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
        "group flex gap-3 rounded-xl border p-2.5 transition-[border-color,box-shadow,background-color]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        active
          ? "border-success/45 bg-card shadow-sm ring-1 ring-success/15"
          : "border-border/80 bg-muted/15 hover:border-success/30 hover:bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-success text-success-foreground"
            : "bg-muted/80 text-muted-foreground group-hover:bg-success/10 group-hover:text-success",
        )}
      >
        <Landmark className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block text-sm font-medium leading-snug text-foreground">Account details</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Allowances & bank info</span>
      </span>
    </Link>
  );
}

export function OfficialAccountsNavSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-2.5 border-t border-border pt-4 lg:mt-auto">
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Allowances
      </p>
      {children}
    </div>
  );
}
