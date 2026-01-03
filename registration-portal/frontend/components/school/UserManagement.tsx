"use client";

import { useEffect, useState } from "react";
import { listSchoolUsers, updateSchoolUser, getSchoolDashboard, getCurrentUser } from "@/lib/api";
import type { User, SchoolDashboardData } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, AlertCircle } from "lucide-react";
import { CreateSchoolUserDialog } from "./CreateSchoolUserDialog";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [dashboardData, setDashboardData] = useState<SchoolDashboardData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const loadData = async () => {
    try {
      const [usersData, dashboard, user] = await Promise.all([
        listSchoolUsers(),
        getSchoolDashboard(),
        getCurrentUser(),
      ]);
      setUsers(usersData);
      setDashboardData(dashboard);
      setCurrentUser(user);
    } catch (error) {
      toast.error("Failed to load users");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Update page title with school name when dashboard data is loaded
    if (dashboardData?.school) {
      document.title = `${dashboardData.school.name} - User Management`;
    }
  }, [dashboardData]);

  const handleToggleActive = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot deactivate your own account");
      return;
    }

    try {
      await updateSchoolUser(user.id, { is_active: !user.is_active });
      toast.success(`User ${user.is_active ? "deactivated" : "activated"} successfully`);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };

  const isAtUserLimit = dashboardData
    ? dashboardData.active_user_count >= dashboardData.max_active_users
    : false;

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">
            Manage users for your school. Maximum {dashboardData?.max_active_users || 5} active users.
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          disabled={isAtUserLimit}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      {isAtUserLimit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have reached the maximum of {dashboardData?.max_active_users || 5} active users. Please
            deactivate an existing user before creating a new one.
          </AlertDescription>
        </Alert>
      )}

      {dashboardData && (
        <Card>
          <CardHeader>
            <CardTitle>User Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{dashboardData.active_user_count}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Maximum Allowed</p>
                <p className="text-2xl font-bold">{dashboardData.max_active_users}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Slots Remaining</p>
                <p className="text-2xl font-bold">
                  {dashboardData.max_active_users - dashboardData.active_user_count}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>User Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.full_name}</TableCell>
                    <TableCell>
                      <span className="capitalize">
                        {user.user_type === "SCHOOL_ADMIN" ? "Coordinator" : "School User"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {user.id !== currentUser?.id && (
                        <Button
                          variant={user.is_active ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleToggleActive(user)}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateSchoolUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={loadData}
        isAtLimit={isAtUserLimit}
      />
    </div>
  );
}
