"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileEdit, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { label: "Application", href: "/dashboard/application", icon: FileEdit },
    { label: "Profile", href: "/dashboard/profile", icon: User },
    { label: "Account settings", href: "/dashboard/account-settings", icon: Settings },
  ];

  return (
    <div className="w-64 border-r bg-card">
      <div className="flex h-full flex-col p-4">
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
