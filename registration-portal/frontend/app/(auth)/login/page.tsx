"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { isAuthenticated } from "@/lib/api";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
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

    // If already authenticated, redirect to dashboard
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Examination Registration Portal</h1>
          <p className="mt-2 text-gray-600">Staff Dashboard</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
