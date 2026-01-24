"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { isAuthenticated, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";
import { Navbar } from "@/components/layout/Navbar";

function PrivateLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // Check if user was redirected due to token expiration
      const expired = searchParams.get("expired");
      if (expired === "true") {
        toast.error("Your session has expired. Please log in again.");
        // Remove the expired parameter from URL
        const newSearchParams = new URLSearchParams(window.location.search);
        newSearchParams.delete("expired");
        const newUrl = window.location.pathname + (newSearchParams.toString() ? `?${newSearchParams.toString()}` : "");
        window.history.replaceState({}, "", newUrl);
      }

      // If already authenticated, check user type
      if (isAuthenticated()) {
        try {
          const user = await getCurrentUser();
          // Prevent SYSTEM_ADMIN, SCHOOL_ADMIN (coordinator), and SCHOOL_USER from accessing private portal
          if (
            user.role === "SystemAdmin" ||
            user.role === "SchoolAdmin" ||
            user.role === "SchoolStaff"
          ) {
            toast.error("This portal is only accessible to private candidates.");
            router.push("/dashboard");
            return;
          }
          // Only PRIVATE_USER can access
          if (user.role === "PublicUser") {
            // Check if there's a redirect parameter
            const redirect = searchParams.get("redirect");
            if (redirect === "certificate-confirmation") {
              router.push("/certificate-confirmation");
            } else if (redirect === "exam-registration") {
              router.push("/dashboard/private/register");
            } else if (redirect === "examiner-applications") {
              router.push("/examiner-applications");
            } else {
              router.push("/dashboard/private");
            }
          }
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
            <h1 className="text-3xl font-bold">CTVET Portal</h1>
            <p className="mt-2 text-gray-600">Login to access our online services.</p>
          </div>
          <LoginForm
            onLoginSuccess={(user) => {
              // Prevent SYSTEM_ADMIN, SCHOOL_ADMIN (coordinator), and SCHOOL_USER from accessing private portal
              if (
                user.role === "SystemAdmin" ||
                user.role === "SchoolAdmin" ||
                user.role === "SchoolStaff"
              ) {
                toast.error("This portal is only accessible to private candidates. Please use the appropriate login page for your account type.");
                // Redirect to main dashboard
                router.push("/dashboard");
                return;
              }
              // Only PRIVATE_USER can access
              if (user.role === "PublicUser") {
                // Check if there's a redirect parameter
                const redirect = searchParams.get("redirect");
                if (redirect === "certificate-confirmation") {
                  router.push("/certificate-confirmation");
                } else if (redirect === "exam-registration") {
                  router.push("/dashboard/private/register");
                } else {
                  router.push("/dashboard/private");
                }
              }
            }}
          />
          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              Don't have an account?{" "}
              <a
                href={`/register-private-account${searchParams.get("redirect") ? `?redirect=${searchParams.get("redirect")}` : ""}`}
                className="text-primary hover:underline"
              >
                Create one here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrivateLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    }>
      <PrivateLoginContent />
    </Suspense>
  );
}
