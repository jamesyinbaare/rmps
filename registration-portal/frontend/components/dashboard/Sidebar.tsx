"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, GraduationCap, Building2, MoreVertical, Settings, HelpCircle, Upload, UserPlus, FileText, BookOpen, BookMarked, Images } from "lucide-react";
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
        if (userData.user_type === "SCHOOL_ADMIN" || userData.user_type === "SCHOOL_USER") {
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

  const isSchoolUser = user?.user_type === "SCHOOL_ADMIN" || user?.user_type === "SCHOOL_USER";
  const isCoordinator = user?.user_type === "SCHOOL_ADMIN";
  const isSystemAdmin = user?.user_type === "SYSTEM_ADMIN";
  const isPrivateUser = user?.user_type === "PRIVATE_USER";

  // Private users have their own dashboard and shouldn't see this sidebar
  if (isPrivateUser) {
    return null;
  }

  const schoolUserNavItems = [
    { href: "/dashboard/my-school", label: "My School", icon: Building2 },
    { href: "/dashboard/my-school/register", label: "Registration", icon: FileText },
    { href: "/dashboard/my-school/candidates", label: "Candidates", icon: GraduationCap },
    { href: "/dashboard/my-school/photo-album", label: "Photo Album", icon: Images },
    // Only coordinators can manage users and programmes
    ...(isCoordinator ? [
      { href: "/dashboard/my-school/users", label: "Users", icon: Users },
      { href: "/dashboard/my-school/programmes", label: "Programmes", icon: BookOpen },
    ] : []),
  ];

  const systemAdminNavItems = [
    { href: "/dashboard", label: "Dashboard", icon: GraduationCap },
    { href: "/dashboard/school-admins", label: "Coordinators", icon: Users },
    { href: "/dashboard/exams", label: "Exams", icon: GraduationCap },
  ];

  const navItems = isSchoolUser ? schoolUserNavItems : systemAdminNavItems;

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
      {isSystemAdmin && (
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
              <DropdownMenuItem asChild>
                <Link href="/dashboard/schools" className="flex items-center">
                  <Building2 className="mr-2 h-4 w-4" />
                  Schools
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setBulkUploadOpen(true);
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload Schools
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/admin/programmes" className="flex items-center">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Programmes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/admin/subjects" className="flex items-center">
                  <BookMarked className="mr-2 h-4 w-4" />
                  Subjects
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/help" className="flex items-center">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help & Support
                </Link>
              </DropdownMenuItem>
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
