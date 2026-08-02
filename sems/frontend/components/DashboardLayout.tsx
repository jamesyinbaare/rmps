"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppLayout,
  AppHeader,
  AppHeaderActions,
  AppHeaderBranding,
  AppSidebar,
  AppBody,
} from "@rfdtech/components/next";
import { ProfilePopover } from "@rfdtech/components";
import { Files, User } from "lucide-react";
import { SemsSidebar } from "@/components/sems-sidebar";
import { getCurrentUser, logout } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { User as SemsUser } from "@/types/document";
import { toast } from "sonner";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function DashboardLayout({
  children,
  title = "All files",
}: DashboardLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<SemsUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) setUser(currentUser);
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      window.location.href = "/login";
    }
  };

  const profileUser = user
    ? {
        name: user.full_name,
        role: normalizeRole(user.role) ?? "User",
        email: user.email,
        initials: initialsFromName(user.full_name),
      }
    : undefined;

  return (
    <div className="h-svh overflow-hidden">
      <AppLayout variant="stacked">
        <AppHeader variant="plain">
          <AppHeaderBranding
            logo={<Files size={22} strokeWidth={1.5} aria-hidden />}
            title="SEMS"
            subtitle={title}
          />
          <AppHeaderActions>
            <ProfilePopover
              variant="avatar"
              loading={loading}
              user={profileUser}
              items={[
                {
                  icon: <User size={20} strokeWidth={1.5} aria-hidden />,
                  label: "Account",
                  onClick: () => router.push("/account"),
                },
              ]}
              onSignOut={() => {
                void handleSignOut();
              }}
            />
          </AppHeaderActions>
        </AppHeader>
        <AppSidebar>
          <SemsSidebar user={user} loading={loading} />
        </AppSidebar>
        <AppBody>{children}</AppBody>
      </AppLayout>
    </div>
  );
}
