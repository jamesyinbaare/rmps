"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MoreVertical, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BulkUploadSchoolsDialog } from "@/components/admin/BulkUploadSchoolsDialog";
import { getCurrentUser, getSchoolDashboard } from "@/lib/api";
import type { User, SchoolDashboardData } from "@/types";
import { getMenuItemsForRole, getMoreActionsForRole, shouldShowMoreActions } from "@/lib/menu-config";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);

        // Load school data for school users
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
  const isPrivateUser = user?.role === "PublicUser";

  // Private users have their own dashboard and shouldn't see this sidebar
  if (isPrivateUser) {
    return null;
  }

  // Dynamically get menu items based on user role
  const navItems = getMenuItemsForRole(user?.role);
  const moreActionsItems = getMoreActionsForRole(user?.role);
  const showMoreActions = shouldShowMoreActions(user?.role);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-gray-50">
      <div className="flex h-16 flex-col justify-center border-b px-6">
        {isSchoolUser && schoolData?.school ? (
          <>
            <h2 className="text-base font-bold text-primary leading-tight">{schoolData.school.name}</h2>
            <p className="text-xs text-muted-foreground">Code: {schoolData.school.code}</p>
          </>
        ) : (
          <h2 className="text-lg font-semibold">Registration Portal</h2>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          let isActive = false;
          // Special handling for my-school base path - only active when exactly matching
          if (item.href === "/dashboard/my-school") {
            isActive = pathname === "/dashboard/my-school";
          } else {
            // For other paths, check exact match or if pathname starts with the href
            isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Show More Actions menu dynamically based on role */}
      {showMoreActions && moreActionsItems.length > 0 && (
        <div className="border-t p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start"
              >
                <MoreVertical className="mr-2 h-4 w-4" />
                More Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-56">
              {moreActionsItems.map((item, index) => {
                const Icon = item.icon;
                const prevItem = index > 0 ? moreActionsItems[index - 1] : null;

                // Add separator before certain items
                const needsSeparator = prevItem && (
                  (item.href.includes("/admin/programmes") && !prevItem.href.includes("/admin/programmes")) ||
                  (item.href.includes("/admin/results") && !prevItem.href.includes("/admin/results")) ||
                  (item.href.includes("/dashboard/settings") && !prevItem.href.includes("/dashboard/settings"))
                );

                return (
                  <div key={item.href}>
                    {needsSeparator && <DropdownMenuSeparator />}
                    <DropdownMenuItem asChild>
                      <Link href={item.href} className="flex items-center">
                        <Icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                    {/* Add bulk upload after Schools item */}
                    {item.href === "/dashboard/schools" && (
                      <>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            setBulkUploadOpen(true);
                          }}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Bulk Upload Schools
                        </DropdownMenuItem>
                        {index < moreActionsItems.length - 1 && <DropdownMenuSeparator />}
                      </>
                    )}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <BulkUploadSchoolsDialog
            open={bulkUploadOpen}
            onOpenChange={setBulkUploadOpen}
            onSuccess={() => {
              // Optionally refresh or navigate to schools page
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
