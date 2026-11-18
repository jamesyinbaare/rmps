"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { AuthLoadingScreen, AuthSplitLayout } from "@/components/auth/AuthSplitLayout";

function PrivateAccountCreationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      await register({
        email,
        password,
        full_name: fullName,
      });

      toast.success("Account created successfully! Redirecting to login...");
      const redirectParam = searchParams.get("redirect");
      const redirectQuery = redirectParam ? `?redirect=${redirectParam}` : "";
      router.push(`/login/private${redirectQuery}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const loginHref = `/login/private${
    searchParams.get("redirect") ? `?redirect=${searchParams.get("redirect")}` : ""
  }`;

  return (
    <AuthSplitLayout
      title="Create account"
      subtitle="Set up a private candidate account for examination registration."
      eyebrow="Private candidates"
      headline="Get started with private examination registration."
      description="Create an account to register for exams, manage your applications, and download slips and invoices."
      form={
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Full name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
              className="h-11"
            />
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
              className="h-11"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              className="h-11"
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      }
      footer={
        <p>
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    />
  );
}

export default function PrivateAccountCreationPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <PrivateAccountCreationContent />
    </Suspense>
  );
}
