"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Check, X, RotateCcw, Search, ArrowLeft, Calendar, User as UserIcon } from "lucide-react";
import {
  getPermissions,
  getUserPermissions,
  grantUserPermission,
  denyUserPermission,
  revokeUserPermission,
} from "@/lib/api/permissions";
import { listAdminUsers } from "@/lib/api";
import { toast } from "sonner";
import type { Permission, UserPermission } from "@/types/permissions";
import type { User } from "@/types";

export default function UserPermissionsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userPermissions, setUserPermissions] = useState<Record<string, UserPermission>>({});
  const [loading, setLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string>("");

  // Load user and permissions
  useEffect(() => {
    const loadData = async () => {
      setUserLoading(true);
      try {
        // Load user details from list (filter by ID)
        const usersResponse = await listAdminUsers({ page: 1, page_size: 1000 });
        const userData = usersResponse.items.find((u) => u.id === userId);
        if (!userData) {
          toast.error("User not found");
          router.back();
          return;
        }
        setUser(userData);

        // Load all available permissions
        const perms = await getPermissions();
        setPermissions(perms);

        // Load user permissions
        await loadUserPermissions();
      } catch (error: any) {
        console.error("Failed to load data:", error);
        const errorMessage = error?.message || "Failed to load user or permissions";
        toast.error(errorMessage);
        // Only redirect if it's a critical error (like user not found)
        if (errorMessage.includes("not found") || errorMessage.includes("404")) {
          router.back();
        }
      } finally {
        setUserLoading(false);
      }
    };

    if (userId) {
      loadData();
    }
  }, [userId, router, showExpired]);

  const loadUserPermissions = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const perms = await getUserPermissions(userId, showExpired);
      setUserPermissions(perms);
    } catch (error: any) {
      console.error("Failed to load user permissions:", error);
      const errorMessage = error?.message || "Failed to load user permissions";
      toast.error(errorMessage);
      // Don't redirect on permissions load failure - user might still want to see other data
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!userId || !selectedPermission) return;

    try {
      await grantUserPermission(userId, {
        permission_key: selectedPermission,
        expires_at: expirationDate || undefined,
      });
      toast.success("Permission granted to user");
      await loadUserPermissions();
      setGrantDialogOpen(false);
      setSelectedPermission(null);
      setExpirationDate("");
    } catch (error: any) {
      console.error("Failed to grant permission:", error);
      toast.error(error?.message || "Failed to grant permission");
    }
  };

  const handleDeny = async () => {
    if (!userId || !selectedPermission) return;

    try {
      await denyUserPermission(userId, { permission_key: selectedPermission });
      toast.success("Permission denied for user");
      await loadUserPermissions();
      setDenyDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error("Failed to deny permission:", error);
      toast.error(error?.message || "Failed to deny permission");
    }
  };

  const handleRevoke = async () => {
    if (!userId || !selectedPermission) return;

    try {
      await revokeUserPermission(userId, selectedPermission);
      toast.success("Permission override revoked (reverted to role/default)");
      await loadUserPermissions();
      setRevokeDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error("Failed to revoke permission:", error);
      toast.error(error?.message || "Failed to revoke permission");
    }
  };

  // Filter permissions by search query
  const filteredPermissions = permissions.filter(
    (perm) =>
      perm.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      perm.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group permissions by category
  const permissionsByCategory = filteredPermissions.reduce(
    (acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>
  );

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading user...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p>User not found</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            User Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage permissions for {user.full_name} ({user.email})
          </p>
        </div>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Full Name</Label>
              <p className="font-medium">{user.full_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Role</Label>
              <Badge variant="outline">{user.role}</Badge>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <Badge variant={user.is_active ? "default" : "destructive"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search permissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-expired"
                checked={showExpired}
                onCheckedChange={(checked) => setShowExpired(checked === true)}
              />
              <Label htmlFor="show-expired" className="cursor-pointer">
                Show expired permissions
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Permissions</CardTitle>
          <CardDescription>
            {userPermissions ? Object.keys(userPermissions).length : 0} permissions
            {Object.values(userPermissions).some((p) => p.is_override) && (
              <span className="text-orange-600 ml-2">
                ({Object.values(userPermissions).filter((p) => p.is_override).length} overrides)
              </span>
            )}
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Permission</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[120px]">Source</TableHead>
                        <TableHead className="w-[150px]">Expires</TableHead>
                        <TableHead className="w-[200px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryPerms
                        .filter((perm) => {
                          const userPerm = userPermissions[perm.key];
                          if (!userPerm) return false;
                          if (userPerm.expires_at && !showExpired) {
                            const expiresAt = new Date(userPerm.expires_at);
                            if (expiresAt < new Date()) return false;
                          }
                          return true;
                        })
                        .map((perm) => {
                          const userPerm = userPermissions[perm.key];
                          const hasPermission = userPerm?.granted ?? false;
                          const isOverride = userPerm?.is_override ?? false;
                          const isExpired =
                            userPerm?.expires_at &&
                            new Date(userPerm.expires_at) < new Date();

                          return (
                            <TableRow key={perm.key}>
                              <TableCell className="font-mono text-sm">{perm.key}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {perm.description}
                              </TableCell>
                              <TableCell>
                                {hasPermission ? (
                                  <Badge
                                    variant={isExpired ? "secondary" : "default"}
                                    className={isExpired ? "" : "bg-green-600"}
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    {isExpired ? "Expired" : "Granted"}
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
                                  <Badge variant="secondary">User Override</Badge>
                                ) : (
                                  <Badge variant="outline">Role/Hierarchy</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {userPerm?.expires_at ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    {new Date(userPerm.expires_at).toLocaleDateString()}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Never</span>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grant Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Permission</DialogTitle>
            <DialogDescription>
              Grant "{selectedPermission}" to {user.full_name}. You can optionally set an expiration date for temporary permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expiration-date">Expiration Date (Optional)</Label>
              <Input
                id="expiration-date"
                type="datetime-local"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for permanent permission, or set a date for temporary access.
              </p>
            </div>
          </div>
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
              Explicitly deny "{selectedPermission}" to {user.full_name}. This will override the role-based permission.
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
              Remove the override for "{selectedPermission}". The user will revert to their role-based or default permission.
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
