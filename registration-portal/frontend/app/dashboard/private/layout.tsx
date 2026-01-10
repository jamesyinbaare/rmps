"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { toast } from "sonner";

export default function PrivateDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      setMounted(true);

      if (!isAuthenticated()) {
        router.push("/login/private");
        return;
      }

      try {
        const userData = await getCurrentUser();
        setUser(userData);

        // Prevent SYSTEM_ADMIN, SCHOOL_ADMIN (coordinator), and SCHOOL_USER from accessing private portal
        if (
          userData.role === "SystemAdmin" ||
          userData.role === "SchoolAdmin" ||
          userData.role === "SchoolStaff"
        ) {
          toast.error("This portal is only accessible to private candidates.");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Failed to get user:", error);
        router.push("/login/private");
        return;
      }

      setChecking(false);
    };

    checkAccess();
  }, [router]);

  if (!mounted || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated() || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Redirecting to login...</div>
      </div>
    );
  }

  // Private dashboard uses the parent dashboard layout (DashboardLayout with TopBar and Sidebar)
  // No need to add another navbar here
  return <>{children}</>;
}
