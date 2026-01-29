"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, getCurrentUser, getApplications } from "@/lib/api";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      const me = await getCurrentUser();
      toast.success("Login successful");
      const role = me.role as string | number;
      const isAdmin =
        role === "ADMIN" ||
        role === "SYSTEM_ADMIN" ||
        role === 10 ||
        role === 0 ||
        role === "10" ||
        role === "0";
      if (isAdmin) {
        router.push("/dashboard/admin");
        return;
      }
      const apps = await getApplications();
      const submitted = apps.find(
        (a) =>
          a.status === "SUBMITTED" ||
          a.status === "UNDER_REVIEW" ||
          a.status === "ACCEPTED"
      );
      if (submitted && me.examiner_id) {
        router.push(`/dashboard/profile/${me.examiner_id}`);
      } else {
        router.push("/application");
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
