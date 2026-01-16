"use client";

import { useEffect, useState } from "react";
import { getSchoolDashboard, getCurrentUser } from "@/lib/api";
import type { SchoolDashboardData } from "@/lib/api";
import type { User } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, UserPlus, AlertCircle, BookOpen, UserCircle, Edit } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function MySchoolDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboardData, setDashboardData] = useState<SchoolDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, dashboard] = await Promise.all([
          getCurrentUser(),
          getSchoolDashboard(),
        ]);
        setUser(userData);
        setDashboardData(dashboard);

        // Update page title with school name
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Dashboard`;
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Failed to load dashboard data</div>
      </div>
    );
  }

  const isAtUserLimit = dashboardData.active_user_count >= dashboardData.max_active_users;
  const userSlotsRemaining = dashboardData.max_active_users - dashboardData.active_user_count;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My School Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.full_name || "User"}
        </p>
      </div>

      {!dashboardData.school.profile_completed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <strong>Complete your school profile</strong>
              <p className="mt-1">
                Please complete your school profile to access all features. All profile fields are
                required.
              </p>
            </div>
            <Link href="/dashboard/my-school/profile">
              <Button size="sm" variant="outline" className="ml-4">
                Complete Profile
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {user?.role === "SchoolAdmin" && isAtUserLimit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have reached the maximum of {dashboardData.max_active_users} active users. Please
            deactivate an existing user before creating a new one.
          </AlertDescription>
        </Alert>
      )}

      <div className={`grid gap-6 ${user?.role === "SchoolAdmin" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {user?.role === "SchoolAdmin" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-2xl font-bold">{dashboardData.active_user_count}</p>
                <p className="text-sm text-muted-foreground">
                  Active users ({userSlotsRemaining} slots remaining)
                </p>
                <Link href="/dashboard/my-school/users">
                  <Button className="w-full mt-4" disabled={isAtUserLimit}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Manage Users
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              School Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {dashboardData.school.profile_completed
                  ? "View and edit your school profile"
                  : "Complete your school profile"}
              </p>
              <Link href="/dashboard/my-school/profile">
                <Button className="w-full mt-4" variant={dashboardData.school.profile_completed ? "default" : "destructive"}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  {dashboardData.school.profile_completed ? "View Profile" : "Complete Profile"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Programmes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">-</p>
              <p className="text-sm text-muted-foreground">
                {user?.role === "SchoolAdmin" ? "Manage school programmes" : "View school programmes"}
              </p>
              <Link href="/dashboard/my-school/programmes">
                <Button className="w-full mt-4">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {user?.role === "SchoolAdmin" ? "Manage Programmes" : "View Programmes"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">{dashboardData.total_candidates}</p>
              <p className="text-sm text-muted-foreground">Total registered candidates</p>
              <Link href="/dashboard/my-school/candidates">
                <Button className="w-full mt-4">View Candidates</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">{dashboardData.total_exams}</p>
              <p className="text-sm text-muted-foreground">Exams with registrations</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
