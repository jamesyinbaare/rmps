"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Files } from "lucide-react";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, isAuthenticated } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  useEffect(() => {
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
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      void getCurrentUser()
        .then((user) => {
          window.location.href =
            normalizeRole(user.role) === "DATACLERK" ? "/clerk" : "/";
        })
        .catch(() => {
          window.location.href = "/";
        });
    }
  }, [router, redirect, searchParams]);

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10 bg-(--clet-bg)">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link
            href="/"
            className="flex items-center gap-2 font-medium text-(--clet-text)"
          >
            <div
              className="flex size-8 items-center justify-center rounded-md"
              style={{
                background: "var(--clet-primary)",
                color: "var(--clet-on-primary)",
              }}
            >
              <Files className="size-4" />
            </div>
            <span>
              <span className="font-semibold">SEMS</span>
              <span className="text-(--clet-text-muted)"> · ICM System</span>
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <LoginForm />
          </div>
        </div>
      </div>
      <div
        className="relative hidden lg:block"
        style={{ background: "var(--clet-app-header-bg, #003764)" }}
        aria-hidden
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-12 text-center text-white">
          <p
            className="text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--clet-secondary, #FFCC00)" }}
          >
            CTVET
          </p>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Certificate II Examination Management
          </h2>
          <p className="max-w-sm text-sm text-white/80">
            Secure document tracking and score processing for CTVET examinations.
          </p>
        </div>
      </div>
    </div>
  );
}
