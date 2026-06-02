"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export type StaffNavLinkItem = {
  href: string;
  label: string;
  active: boolean;
  icon?: boolean;
};

export type StaffNavSectionConfig = {
  title: string;
  items: StaffNavLinkItem[];
};

type StaffPlainNavLinkProps = StaffNavLinkItem & {
  onNavigate?: () => void;
};

export function StaffPlainNavLink({ href, label, active, icon, onNavigate }: StaffPlainNavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-card-foreground hover:bg-muted",
        inputFocusRing,
      )}
    >
      {icon ? <Building2 className="size-3.5 shrink-0 opacity-80" aria-hidden /> : null}
      {label}
    </Link>
  );
}

export function StaffNavSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-3 space-y-0.5 border-t border-border pt-3", className)}>
      <p className="px-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

type StaffSidebarMainNavProps = {
  prependItems?: StaffNavLinkItem[];
  sections: StaffNavSectionConfig[];
  onNavigate?: () => void;
};

export function StaffSidebarMainNav({ prependItems = [], sections, onNavigate }: StaffSidebarMainNavProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {prependItems.map((item) => (
        <StaffPlainNavLink key={item.href} {...item} onNavigate={onNavigate} />
      ))}
      {sections.map((section, index) => (
        <StaffNavSection
          key={section.title}
          title={section.title}
          className={
            prependItems.length === 0 && index === 0 ? "mt-0 border-t-0 pt-0" : undefined
          }
        >
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <StaffPlainNavLink key={item.href} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        </StaffNavSection>
      ))}
    </div>
  );
}
