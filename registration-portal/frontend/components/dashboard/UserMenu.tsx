"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Settings, Palette, LogOut, ArrowLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

interface UserMenuProps {
  user: UserType;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      // Redirect private candidates to home page, others to login
      if (user.role === "PublicUser") {
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch (error) {
      toast.error("Failed to logout");
      // Still redirect even if logout fails
      if (user.role === "PublicUser") {
        router.push("/");
      } else {
        router.push("/login");
      }
    }
  };

  const initials = getInitials(user.full_name);

  return (
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
        <button className="flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold">
            {initials}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] min-h-[360px] pt-4 pl-4 pr-0 pb-4 bg-card rounded-lg">
        {!appearanceOpen ? (
          <>
            <div className="px-2 py-1.5">
              <div className="flex flex-col space-y-1">
                <p className="text-base font-medium leading-none text-card-foreground">{user.full_name}</p>
                <p className="text-sm leading-none text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                router.push("/dashboard/settings");
                setDropdownOpen(false);
              }}
              className="text-base text-card-foreground mb-1"
            >
              <Settings className="mr-2 h-6 w-6 text-card-foreground" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setAppearanceOpen(true);
              }}
              className="text-base text-card-foreground mb-1"
            >
              <Palette className="mr-2 h-6 w-6 text-card-foreground" />
              <span>Appearance</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setLogoutDialogOpen(true);
                setDropdownOpen(false);
              }}
              className="text-[var(--destructive)] text-base"
            >
              <LogOut className="mr-2 h-6 w-6 text-[var(--destructive)]" />
              <span>Log out</span>
            </DropdownMenuItem>
          </>
        ) : (
          <div className="p-3">
            <button
              onClick={() => {
                setAppearanceOpen(false);
              }}
              className="mb-3 flex items-center gap-2 text-sm text-card-foreground hover:text-card-foreground/80"
            >
              <ArrowLeft className="h-4 w-4 text-card-foreground" />
              Back
            </button>
            <AppearanceSheet
              open={appearanceOpen}
              onOpenChange={(open) => {
                setAppearanceOpen(open);
                if (!open) {
                  setDropdownOpen(false);
                }
              }}
            />
          </div>
        )}
      </DropdownMenuContent>
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
              className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive)]/90"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DropdownMenu>
  );
}
