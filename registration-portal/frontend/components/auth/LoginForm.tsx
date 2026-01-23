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
  onLoginSuccess?: (user: User) => Promise<boolean | void> | boolean | void; // Return false to suppress success message
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

      // Get user info to determine redirect destination
      const user = await getCurrentUser();

      // If custom handler provided, use it
      if (onLoginSuccess) {
        const result = onLoginSuccess(user);
        const shouldShowSuccess = result instanceof Promise ? await result : result;
        // Only show success message if handler returns true or undefined (not false)
        if (shouldShowSuccess !== false) {
          toast.success("Login successful");
        }
        // Always return early when custom handler is provided - prevents default redirect
        // Don't set loading to false if redirecting (page will reload anyway)
        setLoading(false);
        return;
      }

      // Default redirect logic (only runs if no custom handler)
      toast.success("Login successful");
      if (user.role === "PublicUser") {
        // Check if user has examiner applications - redirect to examiner dashboard if they do
        // Otherwise redirect to private candidate dashboard
        try {
          const { listExaminerApplications } = await import("@/lib/api");
          const examinerApps = await listExaminerApplications();
          if (examinerApps && examinerApps.length > 0) {
            router.push("/examiner-applications");
          } else {
            router.push("/dashboard/private");
          }
        } catch (error) {
          // If we can't check, default to private dashboard
          router.push("/dashboard/private");
        }
      } else if (user.role === "APIUSER") {
        // Use blocking redirect for API users
        window.location.replace("/api/dashboard");
        return; // Exit immediately
      } else if (user.role === "SchoolAdmin" || user.role === "SchoolStaff") {
        // SchoolAdmin and User go directly to school dashboard
        router.push("/dashboard/my-school");
      } else {
        // SystemAdmin, Director, DeputyDirector, PrincipalManager, and other admin roles go to main dashboard
        router.push("/dashboard");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Logging in..." : "Login"}
      </Button>
    </form>
  );
}
