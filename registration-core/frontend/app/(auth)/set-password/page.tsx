"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { AuthLoadingScreen, AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completePasswordSetup,
  validatePasswordSetupToken,
} from "@/lib/api";

const MIN_PASSWORD_LENGTH = 12;

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) {
        setValid(false);
        setChecking(false);
        return;
      }
      try {
        const result = await validatePasswordSetupToken(token);
        if (!cancelled) {
          setValid(result.valid);
        }
      } catch {
        if (!cancelled) {
          setValid(false);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const validate = () => {
    const errors: { password?: string; confirmPassword?: string } = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (!password.trim()) {
      errors.password = "Password cannot be empty";
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await completePasswordSetup(token, password);
      toast.success("Password set successfully. You can sign in now.");
      router.push("/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid or expired link"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return <AuthLoadingScreen />;
  }

  if (!valid) {
    return (
      <AuthSplitLayout
        title="Link unavailable"
        subtitle="This password link is invalid or has expired."
        eyebrow="CTVET Registration"
        headline="Request a new invite from your administrator."
        description="For security, set-password links can only be used once and expire after a limited time."
        form={
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask your System Admin to resend the invite from Settings → Coordinators.
              If you already activated your account, use forgot password instead.
            </p>
            <Button asChild className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/forgot-password">Forgot password</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmPassword &&
    !submitting;

  return (
    <AuthSplitLayout
      title="Set your password"
      subtitle="Choose a password to finish activating your account."
      eyebrow="CTVET Registration"
      headline="Secure access for registration staff."
      description="After you set a password, sign in with your email to open the dashboard."
      form={
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={
                  fieldErrors.password ? "password-error" : "password-hint"
                }
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={
                  fieldErrors.confirmPassword ? "confirm-error" : undefined
                }
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p id="confirm-error" className="text-xs text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {submitting ? "Saving..." : "Set password"}
          </Button>
        </form>
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already activated?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    />
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <SetPasswordContent />
    </Suspense>
  );
}
