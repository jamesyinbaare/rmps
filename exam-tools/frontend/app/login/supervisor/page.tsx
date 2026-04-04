"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authed";
import { loginSupervisor } from "@/lib/auth";
import {
  formInputClass,
  formLabelClass,
  primaryButtonClass,
} from "@/lib/form-classes";

export default function SupervisorLoginPage() {
  useRedirectIfAuthenticated();
  const router = useRouter();
  const [schoolCode, setSchoolCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = await loginSupervisor(schoolCode.trim(), password);
      router.replace(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 sm:px-6">
      <AuthCard
        title="Supervisor sign in"
        description="Use your school code and password."
      >
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="school_code" className={formLabelClass}>
              School code
            </label>
            <input
              id="school_code"
              name="school_code"
              autoComplete="username"
              required
              value={schoolCode}
              onChange={(e) => setSchoolCode(e.target.value)}
              className={formInputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className={formLabelClass}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={formInputClass}
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
  );
}
