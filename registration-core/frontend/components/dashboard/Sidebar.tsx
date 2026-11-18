"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCurrentUser, getSchoolDashboard } from "@/lib/api";
import type { User, SchoolDashboardData } from "@/types";
import {
  getMenuItemsForRole,
  getMoreActionsForRole,
  shouldShowMoreActions,
  type MenuItem,
} from "@/lib/menu-config";
import { UserMenu } from "./UserMenu";
import { useSidebar } from "./SidebarContext";
import { cn } from "@/lib/utils";

function navItemClass(active: boolean, collapsed: boolean) {
  return cn(
    "relative flex items-center gap-3 rounded-md text-sm font-medium transition-all duration-150 ease-out",
    collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  );
}

function isHrefActive(pathname: string, href: string, siblings: MenuItem[] = []) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/my-school") return pathname === "/dashboard/my-school";

  const exactOrChild =
    pathname === href || pathname.startsWith(href + "/");
  if (!exactOrChild) return false;

  // Prefer the most specific sibling (e.g. Result Blocks over Results)
  const moreSpecificMatch = siblings.some(
    (sibling) =>
      sibling.href !== href &&
      sibling.href.startsWith(href + "/") &&
      (pathname === sibling.href || pathname.startsWith(sibling.href + "/"))
  );
  return !moreSpecificMatch;
}

function MenuItemWithSubmenu({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: MenuItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = item.icon;

  const isSubmenuActive = item.items?.some((subItem) =>
    isHrefActive(pathname, subItem.href)
  );

  useEffect(() => {
    if (isSubmenuActive) setIsOpen(true);
  }, [isSubmenuActive]);

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={navItemClass(!!isSubmenuActive, true)}
        onClick={onNavigate}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </Link>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(navItemClass(!!isSubmenuActive, false), "w-full justify-between")}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          {item.label}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {isOpen && item.items && (
        <div className="ml-4 space-y-1 border-l border-sidebar-border pl-2">
          {item.items.map((subItem) => {
            const SubIcon = subItem.icon;
            const isSubActive = isHrefActive(pathname, subItem.href, item.items);
            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                className={navItemClass(isSubActive, false)}
                onClick={onNavigate}
              >
                <SubIcon className="h-4 w-4 shrink-0" />
                {subItem.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SidebarNavProps {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
  onCollapseClick?: () => void;
}

function SidebarNav({
  collapsed,
  showCollapseControl = false,
  onNavigate,
  onCollapseClick,
}: SidebarNavProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);

        if (userData.role === "SchoolAdmin" || userData.role === "SchoolStaff") {
          try {
            const dashboard = await getSchoolDashboard();
            setSchoolData(dashboard);
          } catch (error) {
            console.error("Failed to load school data:", error);
          }
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const isSchoolUser = user?.role === "SchoolAdmin" || user?.role === "SchoolStaff";
  const navItems = getMenuItemsForRole(user?.role);
  const moreActionsItems = getMoreActionsForRole(user?.role);
  const showSecondaryNav = shouldShowMoreActions(user?.role) && moreActionsItems.length > 0;

  const contextLabel = isSchoolUser
    ? schoolData?.school?.name ?? "School"
    : user?.role === "SystemAdmin"
      ? "Admin"
      : "Staff";
  const contextSub = isSchoolUser
    ? schoolData?.school?.code
      ? `Code: ${schoolData.school.code}`
      : "School workspace"
    : "Registration Portal";

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand + collapse / logo-hover expand when collapsed */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "gap-2 px-3"
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onCollapseClick}
            className="group/brand relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <Image
              src="/logo-crest-only.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain group-hover/brand:hidden group-focus-visible/brand:hidden"
              priority
            />
            <PanelLeftOpen className="hidden size-4 group-hover/brand:block group-focus-visible/brand:block" />
          </button>
        ) : (
          <>
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-2"
              title="CTVET"
              onClick={onNavigate}
            >
              <Image
                src="/logo-crest-only.png"
                alt="CTVET"
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 object-contain"
                priority
              />
              <span className="truncate text-sm font-semibold tracking-tight">CTVET</span>
            </Link>
            {showCollapseControl && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCollapseClick}
                className="ml-auto h-8 w-8 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Workspace chip */}
      {!loading && (
        <div className={cn("border-b border-sidebar-border p-3", collapsed && "px-2")}>
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border border-sidebar-border bg-muted/40 transition-colors duration-150",
              collapsed ? "justify-center p-2" : "px-3 py-2"
            )}
            title={contextLabel}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              {isSchoolUser ? "SC" : "AD"}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{contextLabel}</p>
                <p className="truncate text-xs text-muted-foreground">{contextSub}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasSubmenu = item.items && item.items.length > 0;
          const isSubmenuActive =
            hasSubmenu &&
            item.items?.some((subItem) => isHrefActive(pathname, subItem.href, item.items));
          const isActive = isHrefActive(pathname, item.href, navItems);

          if (hasSubmenu) {
            return (
              <MenuItemWithSubmenu
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={navItemClass(isActive || !!isSubmenuActive, collapsed)}
              onClick={onNavigate}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav — pinned above user footer */}
      {showSecondaryNav && (
        <nav
          aria-label={isSchoolUser ? "School" : "Admin"}
          className={cn(
            "shrink-0 space-y-1 border-t border-sidebar-border p-2",
            collapsed && "px-1"
          )}
        >
          {!collapsed && (
            <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {isSchoolUser ? "School" : "Admin"}
            </p>
          )}
          {moreActionsItems.map((item) => {
            const Icon = item.icon;
            const isActive = isHrefActive(pathname, item.href, moreActionsItems);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={navItemClass(isActive, collapsed)}
                onClick={onNavigate}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {/* User footer */}
      {user && (
        <div className="border-t border-sidebar-border p-2">
          <UserMenu user={user} variant="sidebar" collapsed={collapsed} />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const {
    collapsed,
    toggle,
    mobileOpen,
    setMobileOpen,
    isMobile,
  } = useSidebar();
  const [user, setUser] = useState<User | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser(u);
        setRoleChecked(true);
      })
      .catch(() => setRoleChecked(true));
  }, []);

  // Close mobile sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  if (!roleChecked) {
    return null;
  }

  if (user?.role === "PublicUser") {
    return null;
  }

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-sidebar-border md:flex",
          "transition-[width] duration-200 ease-linear",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <SidebarNav
          collapsed={collapsed}
          showCollapseControl
          onCollapseClick={toggle}
        />
      </aside>

      {/* Mobile off-canvas sheet */}
      <Sheet open={mobileOpen && isMobile} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] border-sidebar-border bg-sidebar p-0 [&>button]:text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
