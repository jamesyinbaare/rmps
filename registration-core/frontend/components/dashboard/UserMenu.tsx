"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Palette, LogOut, ArrowLeft, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logout } from "@/lib/api";
import { toast } from "sonner";
import { AppearanceSheet } from "./AppearanceSheet";
import type { User as UserType } from "@/types";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  user: UserType;
  /** Compact icon-only trigger for collapsed sidebar */
  collapsed?: boolean;
  /** Stretch to full sidebar width with name/email */
  variant?: "default" | "sidebar";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function UserMenu({ user, collapsed = false, variant = "default" }: UserMenuProps) {
  const router = useRouter();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      if (user.role === "PublicUser") {
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch {
      toast.error("Failed to logout");
      if (user.role === "PublicUser") {
        router.push("/");
      } else {
        router.push("/login");
      }
    }
  };

  const initials = getInitials(user.full_name);
  const isSidebar = variant === "sidebar";

  return (
    <>
      <DropdownMenu
        open={dropdownOpen || appearanceOpen}
        onOpenChange={(open) => {
          if (!open && !appearanceOpen) {
            setDropdownOpen(false);
          } else if (open) {
            setDropdownOpen(true);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center rounded-lg transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              isSidebar
                ? cn(
                    "w-full gap-3 px-2 py-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0"
                  )
                : "justify-center p-2 hover:bg-muted"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials}
            </div>
            {isSidebar && !collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">
                    {user.full_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isSidebar ? "start" : "end"}
          side={isSidebar ? "top" : "bottom"}
          className="w-[280px] bg-popover p-2"
        >
          {!appearanceOpen ? (
            <>
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-popover-foreground">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/dashboard/profile-settings");
                  setDropdownOpen(false);
                }}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Profile Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setAppearanceOpen(true);
                }}
              >
                <Palette className="mr-2 h-4 w-4" />
                <span>Appearance</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setLogoutDialogOpen(true);
                  setDropdownOpen(false);
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </>
          ) : (
            <div className="p-1">
              <button
                onClick={() => setAppearanceOpen(false)}
                className="mb-2 flex items-center gap-2 text-sm text-popover-foreground hover:text-popover-foreground/80"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <AppearanceSheet
                open={appearanceOpen}
                onOpenChange={(open) => {
                  setAppearanceOpen(open);
                  if (!open) setDropdownOpen(false);
                }}
              />
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You will need to log in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
