"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./SidebarContext";
import { UserMenu } from "./UserMenu";

function titleFromPath(pathname: string, user: User | null): string {
  if (pathname === "/dashboard") return "Home";
  if (pathname === "/dashboard/my-school") return "Home";
  if (pathname === "/dashboard/private") return "Home";
  if (pathname.startsWith("/dashboard/exams")) return "Examinations";
  if (pathname.startsWith("/dashboard/schools")) return "Schools";
  if (pathname.startsWith("/dashboard/reports")) return "Reports";
  if (pathname.startsWith("/dashboard/my-school/register")) return "Register";
  if (pathname.startsWith("/dashboard/my-school/candidates")) return "Candidates";
  if (pathname.startsWith("/dashboard/my-school/programmes")) return "Programmes";
  if (pathname.startsWith("/dashboard/my-school/users")) return "Users";
  if (pathname.startsWith("/dashboard/my-school/profile")) return "School Profile";
  if (pathname.startsWith("/dashboard/my-school/photo-album")) return "Photo Album";
  if (pathname.startsWith("/dashboard/my-school/documents")) return "Documents";
  if (pathname.startsWith("/dashboard/my-school/timetables")) return "Timetables";
  if (pathname.startsWith("/dashboard/my-school/reports")) return "Reports";
  if (pathname.startsWith("/dashboard/private/register")) return "Register";
  if (pathname.startsWith("/dashboard/admin/users")) return "Users";
  if (pathname.startsWith("/dashboard/admin/programmes")) return "Programmes";
  if (pathname.startsWith("/dashboard/admin/subjects")) return "Subjects";
  if (pathname.startsWith("/dashboard/admin/results")) return "Results";
  if (pathname.startsWith("/dashboard/admin/fees")) return "Fees";
  if (pathname.startsWith("/dashboard/admin/settings")) return "Settings";
  if (pathname.startsWith("/dashboard/admin/permissions")) return "Permissions";
  if (pathname.startsWith("/dashboard/admin/photo-album")) return "Photo Album";
  if (pathname.startsWith("/dashboard/profile-settings")) return "Profile Settings";
  if (pathname.startsWith("/dashboard/credits")) return "Credits";
  if (pathname.startsWith("/dashboard/api-keys")) return "API Keys";
  if (pathname.startsWith("/dashboard/verify")) return "Verify";

  if (user?.role === "PublicUser") return "Private Candidate";
  if (user?.role === "SchoolAdmin" || user?.role === "SchoolStaff") return "School";
  if (user?.role === "SystemAdmin") return "Admin";
  return "Dashboard";
}

export function TopBar() {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // ignore
      });
  }, []);

  const title = useMemo(() => titleFromPath(pathname, user), [pathname, user]);
  const isPrivateUser = user?.role === "PublicUser";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
      {/* Mobile only — desktop expand/collapse lives in the sidebar brand header */}
      {!isPrivateUser && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="h-8 w-8 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Open navigation"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
      <nav aria-label="breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="truncate font-medium text-foreground">{title}</span>
      </nav>
      {isPrivateUser && user && <UserMenu user={user} />}
    </header>
  );
}
