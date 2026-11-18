"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthLoadingScreen, AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { isAuthenticated, getCurrentUser, logout } from "@/lib/api";
import { toast } from "sonner";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const expired = searchParams.get("expired");
      if (expired === "true") {
        toast.error("Your session has expired. Please log in again.");
        const newSearchParams = new URLSearchParams(window.location.search);
        newSearchParams.delete("expired");
        const newUrl =
          window.location.pathname +
          (newSearchParams.toString() ? `?${newSearchParams.toString()}` : "");
        window.history.replaceState({}, "", newUrl);
      }

      if (isAuthenticated()) {
        try {
          const user = await getCurrentUser();
          if (user.role === "PublicUser") {
            await logout();
            toast.error("Access to this page is restricted");
            setChecking(false);
            return;
          }
          if (user.role === "APIUSER") {
            await logout();
            toast.error("API user access is not available in Registration Core.");
            setChecking(false);
            return;
          }
          if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
            router.push("/dashboard/my-school");
          } else {
            router.push("/dashboard");
          }
          return;
        } catch (error) {
          console.error("Failed to get user:", error);
        }
      }
      setChecking(false);
    };

    checkAuth();
  }, [router, searchParams]);

  if (checking) {
    return <AuthLoadingScreen />;
  }

  return (
    <AuthSplitLayout
      title="Sign in"
      subtitle="Staff and school accounts for CTVET registration services."
      eyebrow="CTVET Registration"
      headline="Examination registration you can run with confidence."
      description="Manage schools, candidates, fees, and results in one place — built for CTVET administrators and school coordinators."
      form={
        <LoginForm
          onLoginSuccess={async (user) => {
            if (user.role === "PublicUser") {
              await logout();
              toast.error("Access to this page is restricted");
              return false;
            }
            if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
              router.push("/dashboard/my-school");
            } else {
              router.push("/dashboard");
            }
          }}
        />
      }
      footer={
        <p>
          Private candidate?{" "}
          <Link href="/login/private" className="font-medium text-primary hover:underline">
            Sign in here
          </Link>
        </p>
      }
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
