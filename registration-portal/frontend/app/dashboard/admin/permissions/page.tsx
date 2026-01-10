"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users, UserCheck } from "lucide-react";

export default function PermissionsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Permission Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage role-based and user-based permissions
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Role Permissions Card */}
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push("/dashboard/admin/permissions/roles")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Role Permissions
            </CardTitle>
            <CardDescription>
              Manage permissions for entire roles. Changes apply to all users with that role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• View all permissions for each role</li>
              <li>• Grant or deny permissions to roles</li>
              <li>• Override default hierarchy permissions</li>
              <li>• Revoke role-level overrides</li>
            </ul>
            <Button className="w-full mt-4" onClick={() => router.push("/dashboard/admin/permissions/roles")}>
              Manage Role Permissions
            </Button>
          </CardContent>
        </Card>

        {/* User Permissions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Permissions
            </CardTitle>
            <CardDescription>
              Manage permissions for individual users. Navigate from the user management page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• View all effective permissions for a user</li>
              <li>• Grant or deny permissions to specific users</li>
              <li>• Set temporary permissions with expiration</li>
              <li>• Override role-based permissions</li>
            </ul>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => router.push("/dashboard/admin/users")}
            >
              Go to User Management
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Permissions Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Three-Tier Permission System</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>
                <strong>Role Hierarchy (Default):</strong> Permissions are automatically granted based on role hierarchy. Lower role values have higher privileges.
              </li>
              <li>
                <strong>Role-Level Overrides:</strong> You can grant or deny specific permissions to entire roles, overriding the default hierarchy.
              </li>
              <li>
                <strong>User-Level Overrides:</strong> You can grant or deny specific permissions to individual users, overriding both role hierarchy and role overrides.
              </li>
            </ol>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Permission Resolution Order</h3>
            <p className="text-sm text-muted-foreground">
              When checking if a user has a permission, the system checks in this order:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mt-2">
              <li>User-level permission override (highest priority)</li>
              <li>Role-level permission override</li>
              <li>Role hierarchy (default behavior)</li>
            </ol>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Permission Categories</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>
                <strong>menu_access:</strong> Controls menu item visibility in the frontend
              </li>
              <li>
                <strong>route_access:</strong> Controls API route access in the backend
              </li>
              <li>
                <strong>action:</strong> Controls specific actions (buttons, forms, etc.)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
