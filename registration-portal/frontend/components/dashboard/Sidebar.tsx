"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, GraduationCap, Building2, MoreVertical, Settings, HelpCircle, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BulkUploadSchoolsDialog } from "@/components/admin/BulkUploadSchoolsDialog";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: GraduationCap },
    { href: "/dashboard/school-admins", label: "Coordinators", icon: Users },
    { href: "/dashboard/exams", label: "Exams", icon: GraduationCap },
  ];

  return (
    <div className="flex h-full w-64 flex-col border-r bg-gray-50">
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-lg font-semibold">Registration Portal</h2>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
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
    </div>
  );
}
