"use client";

import { useState, useEffect } from "react";
import { UserDataTable } from "@/components/UserDataTable";
import { EditUserDialog } from "@/components/EditUserDialog";
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listUsers, updateUser, deleteUser, getCurrentUser } from "@/lib/api";
import type { User, UserRole, UserListFilters } from "@/types/document";
import { getAvailableRoles } from "@/lib/role-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Search, X, UserCheck, UserX, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | undefined>(undefined);

  // Filters
  const [filters, setFilters] = useState<UserListFilters>({
    page: 1,
    page_size: 100,
  });
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Load current user info (for role checking)
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        setCurrentUserRole(user.role);

        // Redirect OFFICER and DATACLERK away from users page
        if (user.role === "OFFICER" || user.role === "DATACLERK") {
          window.location.href = "/account";
          return;
        }
      } catch (err) {
        console.error("Error loading current user:", err);
        // If we can't get current user, user might not be authenticated
        // AuthGuard should handle redirect, but we'll set defaults
        setCurrentUserRole(undefined);
      }
    };
    loadCurrentUser();
  }, []);

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const filterParams: UserListFilters = {
          page: filters.page,
          page_size: filters.page_size,
        };

        if (roleFilter !== "all") {
          filterParams.role = roleFilter;
        }
        if (activeFilter !== "all") {
          filterParams.is_active = activeFilter === "active";
        }
        if (searchQuery) {
          filterParams.search = searchQuery;
        }

        const usersList = await listUsers(filterParams);
        setUsers(usersList);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load users";
        setError(errorMessage);
        console.error("Error loading users:", err);
        // If it's a 403, user doesn't have permission
        if (err instanceof Error && errorMessage.includes("403")) {
          toast.error("You don't have permission to access this page");
        }
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, [filters.page, filters.page_size, roleFilter, activeFilter, searchQuery]);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      await deleteUser(userToDelete.id);
      toast.success("User deleted successfully");
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      // Reload users
      const filterParams: UserListFilters = {
        page: filters.page,
        page_size: filters.page_size,
      };
      if (roleFilter !== "all") filterParams.role = roleFilter;
      if (activeFilter !== "all") filterParams.is_active = activeFilter === "active";
      if (searchQuery) filterParams.search = searchQuery;
      const usersList = await listUsers(filterParams);
      setUsers(usersList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
      console.error("Error deleting user:", err);
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setPasswordDialogOpen(true);
  };

  const handleToggleActive = async (user: User) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      toast.success(`User ${user.is_active ? "deactivated" : "activated"} successfully`);
      // Reload users
      const filterParams: UserListFilters = {
        page: filters.page,
        page_size: filters.page_size,
      };
      if (roleFilter !== "all") filterParams.role = roleFilter;
      if (activeFilter !== "all") filterParams.is_active = activeFilter === "active";
      if (searchQuery) filterParams.search = searchQuery;
      const usersList = await listUsers(filterParams);
      setUsers(usersList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
      console.error("Error updating user:", err);
    }
  };

  const handleEditSuccess = async () => {
    // Reload users after edit
    const filterParams: UserListFilters = {
      page: filters.page,
      page_size: filters.page_size,
    };
    if (roleFilter !== "all") filterParams.role = roleFilter;
    if (activeFilter !== "all") filterParams.is_active = activeFilter === "active";
    if (searchQuery) filterParams.search = searchQuery;
    const usersList = await listUsers(filterParams);
    setUsers(usersList);
  };

  const handleCreateSuccess = async () => {
    // Reload users after creation
    const filterParams: UserListFilters = {
      page: filters.page,
      page_size: filters.page_size,
    };
    if (roleFilter !== "all") filterParams.role = roleFilter;
    if (activeFilter !== "all") filterParams.is_active = activeFilter === "active";
    if (searchQuery) filterParams.search = searchQuery;
    const usersList = await listUsers(filterParams);
    setUsers(usersList);
  };

  // Calculate statistics
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.is_active).length;
  const inactiveUsers = users.filter((u) => !u.is_active).length;

  return (
    <DashboardLayout title="Users">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="User Management" />
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Statistics Cards */}
          <div className="px-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Total Users Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Total Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{loading ? "..." : totalUsers}</div>
                </CardContent>
              </Card>

              {/* Active Users Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Active Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{loading ? "..." : activeUsers}</div>
                </CardContent>
              </Card>

              {/* Inactive Users Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserX className="h-5 w-5" />
                    Inactive Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{loading ? "..." : inactiveUsers}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by email or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | "all")}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {getAvailableRoles(currentUserRole).map((role) => {
                      const roleLabels: Record<UserRole, string> = {
                        SUPER_ADMIN: "Super Admin",
                        REGISTRAR: "Registrar",
                        OFFICER: "Officer",
                        DATACLERK: "Data Clerk",
                      };
                      return (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Select
                  value={activeFilter}
                  onValueChange={(value) => setActiveFilter(value as "all" | "active" | "inactive")}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="inactive">Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* User Data Table */}
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New User
                </Button>
              </div>
              <UserDataTable
                users={users}
                loading={loading}
                currentUserRole={currentUserRole}
                currentUserId={currentUser?.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onResetPassword={handleResetPassword}
                onToggleActive={handleToggleActive}
              />
            </div>
          </div>
        </div>
      </div>

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        currentUserRole={currentUserRole}
      />

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        user={selectedUser}
        onSuccess={handleEditSuccess}
        currentUserRole={currentUserRole}
      />

      <ResetPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        user={selectedUser}
        onSuccess={handleEditSuccess}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user{" "}
              <strong>{userToDelete?.email}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
