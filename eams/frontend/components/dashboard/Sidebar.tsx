"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileEdit, User, Settings, Calendar, FileText, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/api";
import type { UserMeResponse } from "@/types";

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

const examinerItems: NavItem[] = [
  { label: "Application", href: "/dashboard/application", icon: FileEdit },
  { label: "Profile", href: "/dashboard/profile", icon: User },
  { label: "Account settings", href: "/dashboard/account-settings", icon: Settings },
];

const adminItems: NavItem[] = [
  { label: "Cycles", href: "/dashboard/admin/cycles", icon: Calendar },
  { label: "Applications", href: "/dashboard/admin/applications", icon: FileText },
  { label: "Subjects", href: "/dashboard/admin/subjects", icon: BookOpen },
  { label: "Profile", href: "/dashboard/profile", icon: User },
  { label: "Account settings", href: "/dashboard/account-settings", icon: Settings },
];

function isAdmin(role: string | number) {
  return (
    role === "ADMIN" ||
    role === "SYSTEM_ADMIN" ||
    role === 10 ||
    role === 0 ||
    role === "10" ||
    role === "0"
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserMeResponse | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const menuItems: NavItem[] = user && isAdmin(user.role) ? adminItems : examinerItems;

  return (
    <div className="w-64 shrink-0 border-r bg-card">
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
