"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { isAuthenticated, getCurrentUser, logout } from "@/lib/api";
import { toast } from "sonner";
import { Navbar } from "@/components/layout/Navbar";

function LoginContent() {
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
          // Prevent PRIVATE_USER from accessing staff login - log them out immediately
          if (user.role === "PublicUser") {
            await logout();
            toast.error("Access to this page is restricted");
            return;
          }
          // Redirect API users to their dashboard
          if (user.role === "APIUSER") {
            router.push("/api/login");
            return;
          }
          // Redirect school users (SchoolAdmin, SchoolStaff) to their school dashboard
          if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
            router.push("/dashboard/my-school");
          } else {
            // SystemAdmin, Director, DeputyDirector, PrincipalManager, and other admin roles go to main dashboard
            router.push("/dashboard");
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
            onLoginSuccess={async (user) => {
              // Prevent PRIVATE_USER from logging in through staff login - log them out immediately
              if (user.role === "PublicUser") {
                await logout();
                toast.error("Access to this page is restricted");
                return false; // Suppress success message
              }
              // Redirect school users (SchoolAdmin, User) to their school dashboard
              if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
                router.push("/dashboard/my-school");
              } else {
                // SystemAdmin, Director, DeputyDirector, PrincipalManager, and other admin roles go to main dashboard
                router.push("/dashboard");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
