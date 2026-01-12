"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser, isAuthenticated, logout } from "@/lib/api";
import { toast } from "sonner";
import { Navbar } from "@/components/layout/Navbar";

export default function ApiLoginPage() {
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
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold">API Portal</h1>
            <p className="mt-2 text-gray-600">Login to access the API dashboard</p>
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
          <div className="text-center text-sm">
            <p className="text-gray-600">
              Need an API account? Contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
