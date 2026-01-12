"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // CRITICAL: Check API users FIRST before any state updates or rendering
      if (isAuthenticated()) {
        try {
          const user = await getCurrentUser();
          // CRITICAL: Redirect API users immediately - blocking redirect
          if (user.role === "APIUSER") {
            window.location.replace("/api/dashboard");
            return; // Exit immediately, don't render anything
          }
        } catch (error) {
          // If we can't get user, continue with normal flow
          console.error("Failed to get user:", error);
        }
      }

      setMounted(true);

      if (!isAuthenticated()) {
        router.push("/login");
        return;
      }

      try {
        const user = await getCurrentUser();

        // Only check role redirect for main dashboard page (not for my-school or private dashboards)
        if (pathname === "/dashboard") {
          // Redirect school users (SchoolAdmin, SchoolStaff) to their school dashboard
          if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
            router.push("/dashboard/my-school");
            setChecking(false);
            return;
          }
          // Redirect private users to their dashboard
          if (user.role === "PublicUser") {
            router.push("/dashboard/private");
            setChecking(false);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to get user:", error);
        // If auth fails, redirect to login
        router.push("/login");
        setChecking(false);
        return;
      }

      setChecking(false);
    };

    checkAuthAndRedirect();
  }, [router, pathname]);

  if (!mounted || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Redirecting to login...</div>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
