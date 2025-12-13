"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home,
  Files,
  Clock,
  Star,
  Share2,
  Folder,
  Activity,
  Grid3x3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  submenu?: MenuItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const [selectedMenu, setSelectedMenu] = useState<string | null>("home");
  const [submenuVisible, setSubmenuVisible] = useState(true); // Default to visible (will be adjusted by useEffect on mobile)
  const [isMobile, setIsMobile] = useState(false);

  const menuItems: MenuItem[] = [
    {
      href: "/",
      label: "Home",
      icon: Home,
      submenu: [
        { href: "/documents", label: "All files", icon: Files },
        { href: "/documents?filter=recent", label: "Recent", icon: Clock },
        { href: "/documents?filter=starred", label: "Starred", icon: Star },
        { href: "/documents?filter=shared", label: "Shared", icon: Share2 },
      ],
    },
    {
      href: "/activity",
      label: "Activity",
      icon: Activity,
    },
    {
      href: "/more",
      label: "More",
      icon: Grid3x3,
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname?.startsWith(href);
  };

  const selectedMenuItem = menuItems.find(
    (item) => item.href.toLowerCase().replace(/[^a-z0-9]/g, "") === selectedMenu
  );

  // Check screen size and set submenu visibility
  useEffect(() => {
    const checkScreenSize = () => {
      const isSmallScreen = window.innerWidth < 768; // md breakpoint
      setIsMobile(isSmallScreen);
      // Open submenu by default on medium+ screens if Home is selected
      if (!isSmallScreen && selectedMenu === "home" && selectedMenuItem?.submenu) {
        setSubmenuVisible(true);
      } else if (isSmallScreen) {
        setSubmenuVisible(false);
      }
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, [selectedMenu, selectedMenuItem]);

  const handleMenuClick = (item: MenuItem) => {
    if (item.submenu && item.submenu.length > 0) {
      const menuKey = item.href.toLowerCase().replace(/[^a-z0-9]/g, "");
      setSelectedMenu(menuKey);
      // Open submenu on medium+ screens, close on mobile
      if (!isMobile) {
        setSubmenuVisible(true);
      } else {
        setSubmenuVisible(false);
      }
    } else {
      setSelectedMenu(null);
      setSubmenuVisible(false);
    }
  };

  // Responsive sidebar width: narrow on mobile, wider on desktop
  // Main menu:submenu ratio is 1:3 (64px:192px = 256px total)
  const sidebarWidth = isMobile
    ? "w-16" // Icon-only on mobile (64px)
    : submenuVisible && selectedMenuItem?.submenu
    ? "w-64" // 64px main (w-16) + 192px submenu (w-48) = 256px total (w-64)
    : "w-16"; // Just main menu on desktop (64px)

  return (
    <aside className={cn("flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200", sidebarWidth)}>
      <div className="flex flex-1 overflow-hidden">
        {/* Main Menu - 1 unit (64px) */}
        <div className={cn("flex flex-col border-r border-sidebar-border transition-all duration-200", isMobile ? "w-16" : "w-16")}>
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center justify-center border-b border-sidebar-border px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
              <Files className="h-6 w-6" />
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const menuKey = item.href.toLowerCase().replace(/[^a-z0-9]/g, "");
              const hasSubmenu = item.submenu && item.submenu.length > 0;
              const isSelected = selectedMenu === menuKey;
              const active = isActive(item.href) || (hasSubmenu && item.submenu?.some((sub) => isActive(sub.href)));

              return (
                <div key={item.href} className="mb-1">
                  {hasSubmenu ? (
                    <button
                      onClick={() => handleMenuClick(item)}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-1 rounded-md px-2 py-2.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        (active || isSelected) && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={cn("text-center text-[10px] leading-tight", isMobile && "hidden")}>{item.label}</span>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => handleMenuClick(item)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-md px-2 py-2.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={cn("text-center text-[10px] leading-tight", isMobile && "hidden")}>{item.label}</span>
                    </Link>
                  )}
                </div>
              );
            })}

            {/* Folders Section */}
            <div className="mt-6">
              <button className={cn(
                "flex w-full flex-col items-center justify-center gap-1 rounded-md px-2 py-2.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <Folder className="h-4 w-4 shrink-0" />
                <span className={cn("text-center text-[10px] leading-tight", isMobile && "hidden")}>Folders</span>
              </button>
            </div>
          </nav>

          {/* Submenu Toggle Button */}
          {!isMobile && selectedMenuItem?.submenu && (
            <div className="flex items-center justify-center border-t border-sidebar-border px-2 py-2 shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={() => setSubmenuVisible(!submenuVisible)}
                title={submenuVisible ? "Hide submenu" : "Show submenu"}
              >
                {submenuVisible ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Submenu - Hidden on mobile, 3 units (192px) - 1:3 ratio with main menu */}
        {!isMobile && submenuVisible && selectedMenuItem?.submenu && (
          <div className="flex w-48 flex-col border-l border-sidebar-border">
            <div className="h-16 shrink-0 border-b border-sidebar-border" />
            <nav className="flex-1 overflow-y-auto px-2 py-4">
              {selectedMenuItem.submenu.map((subItem) => {
                const SubIcon = subItem.icon;
                const subActive = isActive(subItem.href);
                return (
                  <Link
                    key={subItem.href}
                    href={subItem.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      subActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <SubIcon className="h-4 w-4" />
                    <span>{subItem.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
}
