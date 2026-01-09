"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Award, LogOut, Home } from "lucide-react";
import { logout } from "@/lib/api";

export default function CertificateConfirmationLayout({
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
        router.push("/login/private?redirect=certificate-confirmation");
        return;
      }

      try {
        const userData = await getCurrentUser();
        setUser(userData);

        // Only PRIVATE_USER can access certificate confirmation
        if (userData.role !== "PublicUser") {
          toast.error("This portal is only accessible to private candidates.");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Failed to get user:", error);
        router.push("/login/private?redirect=certificate-confirmation");
        return;
      }

      setChecking(false);
    };

    checkAccess();
  }, [router]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Certificate Confirmation & Verification</h1>
              <p className="text-xs text-muted-foreground">Request confirmation or verification of your certificate</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.full_name}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation - Removed old tabs as functionality is now consolidated in requests page */}

      {/* Main Content */}
      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
