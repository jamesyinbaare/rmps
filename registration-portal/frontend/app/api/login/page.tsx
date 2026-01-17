"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser, isAuthenticated, logout } from "@/lib/api";
import { toast } from "sonner";
import { Key } from "lucide-react";
import Image from "next/image";

function ApiLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // Check if user was redirected due to token expiration
      const expired = searchParams.get("expired");
      if (expired === "true") {
        toast.error("Your session has expired. Please login again.");
        // Remove expired parameter from URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }

      // If already authenticated, check user type
      if (isAuthenticated()) {
        try {
          const user = await getCurrentUser();
          // Only APIUSER can access this login page
          if (user.role !== "APIUSER") {
            await logout();
            toast.error("This login page is only for API users. Please use the appropriate login page for your account type.");
            router.push("/login");
            return;
          }
          // Redirect API users to their dashboard immediately
          window.location.replace("/api/dashboard");
        } catch (error) {
          // If we can't get user, just stay on login page
          console.error("Failed to get user:", error);
        }
      }
      setChecking(false);
    };

    checkAuth();
  }, [router, searchParams]);

  if (checking) {
    return (
      <div className="grid min-h-svh lg:grid-cols-2">
        <div className="flex flex-col gap-4 p-6 md:p-10">
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">Loading...</div>
          </div>
        </div>
        <div className="bg-muted relative hidden lg:flex items-center justify-center">
          <div className="text-center text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left side - Login form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex size-6 items-center justify-center rounded-md">
              <Key className="size-4" />
            </div>
            CTVET Results Verification Portal
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs space-y-6">
            {/* Crest logo at top */}
            <div className="flex justify-center">
              <div className="relative w-32 h-32">
                <Image
                  src="/logo-crest-only.png"
                  alt="CTVET Crest"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold">Login to your account</h1>
              <p className="text-muted-foreground text-sm text-balance">
                Enter your credentials to access the API dashboard
              </p>
            </div>
            <LoginForm
              onLoginSuccess={(user) => {
                // Only APIUSER can access
                if (user.role !== "APIUSER") {
                  toast.error("This portal is only accessible to API users. Please use the appropriate login page for your account type.");
                  setTimeout(() => {
                    window.location.replace("/login");
                  }, 1500);
                  return false;
                }
                // CRITICAL: Immediately redirect to API dashboard - blocking redirect
                // This MUST happen before any other code executes
                window.location.replace("/api/dashboard");
                return false; // Prevent default redirect
              }}
            />
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Need an API account? Contact your system administrator.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Decorative background */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 relative hidden lg:block" />
    </div>
  );
}

export default function ApiLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <ApiLoginContent />
    </Suspense>
  );
}
