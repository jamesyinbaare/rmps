"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Files } from "lucide-react"
import Link from "next/link"
import { LoginForm } from "@/components/login-form"
import { isAuthenticated } from "@/lib/api"
import { toast } from "sonner"

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

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

    // If already authenticated, redirect to home or intended destination
    if (isAuthenticated()) {
      // Use window.location for immediate redirect to avoid stuck state
      window.location.href = redirect || "/";
    }
  }, [router, redirect, searchParams]);

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <Files className="size-4" />
            </div>
            ICM System
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <img
          src="/placeholder.svg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}
