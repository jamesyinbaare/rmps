"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { toast } from "sonner";

interface LoginFormProps {
  onLoginSuccess?: (user: User) => Promise<boolean | void> | boolean | void;
}

export function LoginForm({ onLoginSuccess }: LoginFormProps = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      const user = await getCurrentUser();

      if (onLoginSuccess) {
        const result = onLoginSuccess(user);
        const shouldShowSuccess = result instanceof Promise ? await result : result;
        if (shouldShowSuccess !== false) {
          toast.success("Login successful");
        }
        setLoading(false);
        return;
      }

      toast.success("Login successful");
      if (user.role === "PublicUser") {
        router.push("/dashboard/private");
      } else if (user.role === "APIUSER") {
        toast.error("API user access is not available in Registration Core.");
        return;
      } else if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
        router.push("/dashboard/my-school");
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <Label htmlFor="password" className="text-sm font-medium">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          className="h-11"
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
