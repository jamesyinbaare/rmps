"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AuthLoadingScreen, AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/api";

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const prefill = searchParams.get("email");
    if (prefill) {
      setEmail(prefill);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
      toast.success("If an account exists for that email, we sent a reset link.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send reset email. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      title="Forgot password"
      subtitle="Enter your account email and we’ll send a reset link if it exists."
      eyebrow="CTVET Registration"
      headline="Reset access securely."
      description="We’ll email a one-time link so you can choose a new password. The link expires after a limited time."
      form={
        submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, check your inbox for a
              reset link. You can close this page or return to sign in.
            </p>
            <Button asChild className="h-11 w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11"
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    />
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
