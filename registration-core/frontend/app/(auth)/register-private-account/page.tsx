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
  const [username, setUsername] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await register({
        email: email.trim(),
        username: username.trim().toLowerCase(),
      });

      toast.success("If the email is valid, we sent a link to set your password.");
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
      subtitle="Enter your email and a unique username. We’ll email a link to set your password."
      eyebrow="Private candidates"
      headline="Get started with private examination registration."
      description="Create an account to register for exams, manage your applications, and download slips and invoices."
      form={
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

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]{3,32}"
              disabled={loading}
              className="h-11"
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">
              3–32 characters: letters, numbers, and underscores
            </p>
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
