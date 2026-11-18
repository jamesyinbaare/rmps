"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthLoadingScreen, AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { isAuthenticated, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";

function PrivateLoginContent() {
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
          if (
            user.role === "SystemAdmin" ||
            user.role === "SchoolAdmin" ||
            user.role === "SchoolStaff"
          ) {
            toast.error("This portal is only accessible to private candidates.");
            router.push("/dashboard");
            return;
          }
          if (user.role === "PublicUser") {
            const redirect = searchParams.get("redirect");
            if (redirect === "exam-registration") {
              router.push("/dashboard/private/register");
            } else {
              router.push("/dashboard/private");
            }
            return;
          }
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

  const redirectParam = searchParams.get("redirect");
  const registerHref = `/register-private-account${
    redirectParam ? `?redirect=${redirectParam}` : ""
  }`;

  return (
    <AuthSplitLayout
      title="Sign in"
      subtitle="Private candidate access for examination registration."
      eyebrow="Private candidates"
      headline="Register for examinations on your own schedule."
      description="Create or continue a private registration, download index slips, and track invoices — without a school account."
      form={
        <LoginForm
          onLoginSuccess={(user) => {
            if (
              user.role === "SystemAdmin" ||
              user.role === "SchoolAdmin" ||
              user.role === "SchoolStaff"
            ) {
              toast.error(
                "This portal is only accessible to private candidates. Please use the appropriate login page for your account type."
              );
              router.push("/dashboard");
              return false;
            }
            if (user.role === "PublicUser") {
              const redirect = searchParams.get("redirect");
              if (redirect === "exam-registration") {
                router.push("/dashboard/private/register");
              } else {
                router.push("/dashboard/private");
              }
            }
          }}
        />
      }
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="font-medium text-primary hover:underline">
            Create one here
          </Link>
        </p>
      }
    />
  );
}

export default function PrivateLoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <PrivateLoginContent />
    </Suspense>
  );
}
