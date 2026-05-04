"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { PublicSiteNav } from "@/components/public-site-nav";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authed";
import { loginSuperAdmin } from "@/lib/auth";
import {
  formInputClass,
  formLabelClass,
  primaryButtonClass,
} from "@/lib/form-classes";

export default function AdminLoginPage() {
  useRedirectIfAuthenticated();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = await loginSuperAdmin(email.trim(), password);
      router.replace(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicSiteNav />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        <AuthCard
          title="Administrator sign in"
          description="Super admin access for system management."
        >
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="email" className={formLabelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={formInputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className={formLabelClass}>
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className={primaryButtonClass}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              href="/"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Back to home
            </Link>
          </p>
        </AuthCard>
      </div>
    </div>
  );
}
