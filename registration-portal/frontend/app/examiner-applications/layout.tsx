"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { toast } from "sonner";

export default function ExaminerApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      setMounted(true);

      if (!isAuthenticated()) {
        router.push("/login/private?redirect=examiner-applications");
        return;
      }

      try {
        const userData = await getCurrentUser();
        setUser(userData);

        // Allow all authenticated users to access examiner applications
        // (PublicUser, SystemAdmin, etc. - anyone can apply to be an examiner)
      } catch (error) {
        console.error("Failed to get user:", error);
        router.push("/login/private?redirect=examiner-applications");
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

  // Return children without the registration dashboard layout
  return <>{children}</>;
}
