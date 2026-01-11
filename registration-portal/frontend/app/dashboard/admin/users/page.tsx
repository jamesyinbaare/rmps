"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateAdminUserDialog } from "@/components/admin/CreateAdminUserDialog";
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";
import { BulkUploadSchoolAdminUsersDialog } from "@/components/admin/BulkUploadSchoolAdminUsersDialog";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import {
  listAdminUsers,
  updateAdminUser,
  resetUserPassword,
  getCurrentUser,
} from "@/lib/api";
import { toast } from "sonner";
import type { User, Role, UserListFilters } from "@/types";
import { Plus, Upload } from "lucide-react";

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Pagination - load more data for client-side filtering/sorting
  const [filters, setFilters] = useState<UserListFilters>({
    page: 1,
    page_size: 100, // Load more data for client-side datatable operations
  });

  // Pagination state
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        // Only SystemAdmin and other admin roles can access this page
        if (user.role === "SchoolAdmin" || user.role === "SchoolStaff" || user.role === "PublicUser") {
          toast.error("Access denied. This page is only available to system administrators.");
          router.push("/dashboard/my-school");
          return;
        }
        setCurrentUser(user);
        setCheckingAccess(false);
        loadUsers();
      } catch (error) {
        toast.error("Failed to verify access");
        router.push("/dashboard");
      }
    };

    checkAccess();
  }, [router]);

  useEffect(() => {
    if (!checkingAccess) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.page_size, checkingAccess]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params: UserListFilters = {
        page: filters.page,
        page_size: filters.page_size,
      };

      // Note: Search, filtering, and sorting are handled client-side by the datatable

      const response = await listAdminUsers(params);
      setUsers(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (error) {
      toast.error("Failed to load users");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuccess = () => {
    loadUsers();
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (fullName?: string, isActive?: boolean) => {
    if (!selectedUser) return;

    try {
      await updateAdminUser(selectedUser.id, {
        full_name: fullName,
        is_active: isActive,
      });
      toast.success("User updated successfully");
      setEditDialogOpen(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setResetPasswordDialogOpen(true);
  };

  const handleResetPasswordSuccess = () => {
    loadUsers();
  };

  const handleToggleActive = async (user: User) => {
    try {
      await updateAdminUser(user.id, { is_active: !user.is_active });
      toast.success(`User ${user.is_active ? "deactivated" : "activated"} successfully`);
      loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };


  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage admin user accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Users</CardTitle>
            {total > 0 && (
              <span className="text-sm text-muted-foreground">
                {total} {total === 1 ? "user" : "users"} total
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6">
            <AdminUserTable
              users={users}
              loading={loading}
              currentUserId={currentUser?.id}
              onEdit={handleEdit}
              onResetPassword={handleResetPassword}
              onToggleActive={handleToggleActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateAdminUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <BulkUploadSchoolAdminUsersDialog
        open={bulkUploadDialogOpen}
        onOpenChange={setBulkUploadDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <ResetPasswordDialog
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
        user={selectedUser}
        onSuccess={handleResetPasswordSuccess}
      />

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <EditUserForm
              user={selectedUser}
              onSubmit={(fullName, isActive) => {
                handleEditSubmit(fullName, isActive);
              }}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedUser(null);
              }}
              isCurrentUser={selectedUser.id === currentUser?.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditUserForm({
  user,
  onSubmit,
  onCancel,
  isCurrentUser,
}: {
  user: User;
  onSubmit: (fullName?: string, isActive?: boolean) => void;
  onCancel: () => void;
  isCurrentUser: boolean;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [isActive, setIsActive] = useState(user.is_active);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(fullName, isActive);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="edit-fullName">Full Name</Label>
          <Input
            id="edit-fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-isActive">Status</Label>
          <Select
            value={isActive ? "active" : "inactive"}
            onValueChange={(value) => setIsActive(value === "active")}
            disabled={loading || isCurrentUser}
          >
            <SelectTrigger id="edit-isActive">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive" disabled={isCurrentUser}>
                Inactive {isCurrentUser && "(Cannot deactivate yourself)"}
              </SelectItem>
            </SelectContent>
          </Select>
          {isCurrentUser && (
            <p className="text-sm text-muted-foreground">
              You cannot deactivate your own account
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
