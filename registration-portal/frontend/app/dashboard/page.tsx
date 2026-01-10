"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, Building2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then((userData) => {
        if (!mounted) return;

        setUser(userData);
        setLoading(false);

        // Redirect private users to their dashboard
        if (userData.role === "PublicUser") {
          setRedirecting(true);
          router.push("/dashboard/private");
          return;
        }

        // Redirect school users (SchoolAdmin, User) to their school dashboard
        if (userData.role === "SchoolAdmin" || userData.role === "SchoolStaff") {
          setRedirecting(true);
          router.push("/dashboard/my-school");
          return;
        }
      })
      .catch((error) => {
        console.error("Failed to get user:", error);
        if (!mounted) return;

        setLoading(false);
        // If we can't get user, redirect to login
        router.push("/login");
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  // Only show system admin dashboard for SystemAdmin, Director, DeputyDirector, PrincipalManager, and other admin roles
  const isSystemAdmin = user?.role === "SystemAdmin" ||
                        user?.role === "Director" ||
                        user?.role === "DeputyDirector" ||
                        user?.role === "PrincipalManager" ||
                        user?.role === "SeniorManager" ||
                        user?.role === "Manager" ||
                        user?.role === "Staff";

  // Show loading while checking user
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // If redirecting, show loading
  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Redirecting...</div>
      </div>
    );
  }

  // If no user or not a system admin, the layout should have redirected, but show loading as fallback
  if (!user || !isSystemAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.full_name || "Admin"}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Coordinators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Manage coordinator accounts</p>
            <Link href="/dashboard/school-admins">
              <Button>Manage Coordinators</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Examinations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Set up and manage examination registration periods</p>
            <Link href="/dashboard/exams">
              <Button>Manage Exams</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Schools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">View and manage all schools</p>
            <Link href="/dashboard/schools">
              <Button>Manage Schools</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
