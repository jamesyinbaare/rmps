"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { LoginExpiredNotice } from "@/components/login-expired-notice";
import { PasswordInput } from "@/components/password-input";
import { PublicSiteNav } from "@/components/public-site-nav";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authed";
import { loginInspector } from "@/lib/auth";
import {
  formInputClass,
  formLabelClass,
  primaryButtonClass,
} from "@/lib/form-classes";

export default function InspectorLoginPage() {
  useRedirectIfAuthenticated();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = await loginInspector(phone.trim(), password);
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
          title="Inspector sign in"
          description="Use your phone number and password. If you have more than one centre posting, you will choose a workspace after signing in."
        >
          <LoginExpiredNotice />
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="phone" className={formLabelClass}>
                Phone number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
            <button type="submit" disabled={loading} className={primaryButtonClass}>
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
