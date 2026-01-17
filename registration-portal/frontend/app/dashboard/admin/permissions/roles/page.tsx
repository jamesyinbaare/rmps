"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Check, X, RotateCcw, Search } from "lucide-react";
import { getPermissions, getRolePermissions, grantRolePermission, denyRolePermission, revokeRolePermission } from "@/lib/api/permissions";
import { toast } from "sonner";
import type { Permission, RolePermission } from "@/types/permissions";
import type { Role } from "@/types";

const ROLE_OPTIONS: Role[] = [
  "SystemAdmin",
  "Director",
  "DeputyDirector",
  "PrincipalManager",
  "SeniorManager",
  "Manager",
  "Staff",
  "SchoolAdmin",
  "SchoolStaff",
];

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  SystemAdmin: "System Admin",
  Director: "Director",
  DeputyDirector: "Deputy Director",
  PrincipalManager: "Principal Manager",
  SeniorManager: "Senior Manager",
  Manager: "Manager",
  Staff: "Staff",
  SchoolAdmin: "School Admin",
  SchoolStaff: "School Staff",
  PublicUser: "Public User",
  APIUSER: "API User",
};

export default function RolePermissionsPage() {
  const [selectedRole, setSelectedRole] = useState<Role | "">("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermission>>({});
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<string | null>(null);

  // Load all available permissions
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const perms = await getPermissions();
        setPermissions(perms);
      } catch (error) {
        console.error("Failed to load permissions:", error);
        toast.error("Failed to load permissions");
      }
    };
    loadPermissions();
  }, []);

  // Load role permissions when role is selected
  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole]);

  const loadRolePermissions = async (role: Role) => {
    setLoading(true);
    try {
      const perms = await getRolePermissions(role);
      setRolePermissions(perms);
    } catch (error) {
      console.error("Failed to load role permissions:", error);
      toast.error("Failed to load role permissions");
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!selectedRole || !selectedPermission) return;

    try {
      await grantRolePermission(selectedRole, { permission_key: selectedPermission });
      toast.success("Permission granted to role");
      await loadRolePermissions(selectedRole);
      setGrantDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error("Failed to grant permission:", error);
      toast.error(error?.message || "Failed to grant permission");
    }
  };

  const handleDeny = async () => {
    if (!selectedRole || !selectedPermission) return;

    try {
      await denyRolePermission(selectedRole, { permission_key: selectedPermission });
      toast.success("Permission denied for role");
      await loadRolePermissions(selectedRole);
      setDenyDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error("Failed to deny permission:", error);
      toast.error(error?.message || "Failed to deny permission");
    }
  };

  const handleRevoke = async () => {
    if (!selectedRole || !selectedPermission) return;

    try {
      await revokeRolePermission(selectedRole, selectedPermission);
      toast.success("Permission override revoked (reverted to default)");
      await loadRolePermissions(selectedRole);
      setRevokeDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error("Failed to revoke permission:", error);
      toast.error(error?.message || "Failed to revoke permission");
    }
  };

  // Filter permissions by search query
  const filteredPermissions = permissions.filter((perm) =>
    perm.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    perm.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group permissions by category
  const permissionsByCategory = filteredPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Role Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage permissions for each role. Overrides apply to all users with that role.
          </p>
        </div>
      </div>

      {/* Role Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Role</CardTitle>
          <CardDescription>Choose a role to view and manage its permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as Role)}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_DISPLAY_NAMES[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedRole && (
        <>
          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search permissions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Permissions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions for {ROLE_DISPLAY_NAMES[selectedRole]}</CardTitle>
              <CardDescription>
                {rolePermissions ? Object.keys(rolePermissions).length : 0} permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-center text-muted-foreground">Loading permissions...</div>
              ) : (
                <div className="divide-y">
                  {Object.entries(permissionsByCategory).map(([category, categoryPerms]) => (
                    <div key={category} className="p-6">
                      <h3 className="font-semibold text-lg mb-4 capitalize">
                        {category.replace("_", " ")}
                      </h3>
                      {categoryPerms.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No permissions found in this category
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[300px]">Permission</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="w-[150px]">Default Min Role</TableHead>
                              <TableHead className="w-[120px]">Status</TableHead>
                              <TableHead className="w-[120px]">Source</TableHead>
                              <TableHead className="w-[200px] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryPerms.map((perm) => {
                            const rolePerm = rolePermissions[perm.key];
                            const hasPermission = rolePerm?.granted ?? false;
                            const isOverride = rolePerm?.is_override ?? false;
                            const defaultRoleMet =
                              selectedRole &&
                              ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"].indexOf(selectedRole) <=
                                ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"].indexOf(perm.default_min_role);

                            return (
                              <TableRow key={perm.key}>
                                <TableCell className="font-mono text-sm">{perm.key}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {perm.description}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{perm.default_min_role}</Badge>
                                </TableCell>
                                <TableCell>
                                  {hasPermission ? (
                                    <Badge variant="default" className="bg-green-600">
                                      <Check className="h-3 w-3 mr-1" />
                                      Granted
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">
                                      <X className="h-3 w-3 mr-1" />
                                      Denied
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isOverride ? (
                                    <Badge variant="secondary">Override</Badge>
                                  ) : (
                                    <Badge variant="outline">Hierarchy</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {isOverride ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedPermission(perm.key);
                                          setRevokeDialogOpen(true);
                                        }}
                                      >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Revoke
                                      </Button>
                                    ) : (
                                      <>
                                        {!hasPermission && (
                                          <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => {
                                              setSelectedPermission(perm.key);
                                              setGrantDialogOpen(true);
                                            }}
                                          >
                                            <Check className="h-3 w-3 mr-1" />
                                            Grant
                                          </Button>
                                        )}
                                        {hasPermission && (
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => {
                                              setSelectedPermission(perm.key);
                                              setDenyDialogOpen(true);
                                            }}
                                          >
                                            <X className="h-3 w-3 mr-1" />
                                            Deny
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Grant Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Permission</DialogTitle>
            <DialogDescription>
              Grant "{selectedPermission}" to {selectedRole ? ROLE_DISPLAY_NAMES[selectedRole] : "role"}.
              This will apply to all users with this role.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGrant}>Grant Permission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny Dialog */}
      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Permission</DialogTitle>
            <DialogDescription>
              Explicitly deny "{selectedPermission}" to {selectedRole ? ROLE_DISPLAY_NAMES[selectedRole] : "role"}.
              This will override the default hierarchy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeny}>
              Deny Permission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Permission Override</DialogTitle>
            <DialogDescription>
              Remove the override for "{selectedPermission}". The role will revert to the default
              hierarchy-based permission.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleRevoke}>
              Revoke Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
