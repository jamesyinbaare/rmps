"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { CreateAdminUserDialog } from "@/components/admin/CreateAdminUserDialog";
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";
import { BulkUploadSchoolAdminUsersDialog } from "@/components/admin/BulkUploadSchoolAdminUsersDialog";
import {
  listPublicUsers,
  listSchoolStaffUsers,
  listSchoolAdmins,
  listCtvetStaffUsers,
  getCurrentUser,
  updateAdminUser,
  resetUserPassword,
} from "@/lib/api";
import { toast } from "sonner";
import type { User } from "@/types";
import { ArrowLeft, Settings as SettingsIcon, Plus, Upload } from "lucide-react";

type UserGroupTab = "general-public" | "coordinators" | "ctvet-staff";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<UserGroupTab>("general-public");
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // User data for each tab
  const [generalPublicUsers, setGeneralPublicUsers] = useState<User[]>([]);
  const [coordinatorUsers, setCoordinatorUsers] = useState<User[]>([]);
  const [ctvetStaffUsers, setCtvetStaffUsers] = useState<User[]>([]);

  // Loading states for each tab
  const [loadingGeneralPublic, setLoadingGeneralPublic] = useState(false);
  const [loadingCoordinators, setLoadingCoordinators] = useState(false);
  const [loadingCtvetStaff, setLoadingCtvetStaff] = useState(false);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Check access on mount
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        // Only system admin roles can access this page
        if (
          user.role === "SchoolAdmin" ||
          user.role === "SchoolStaff" ||
          user.role === "PublicUser"
        ) {
          toast.error(
            "Access denied. This page is only available to system administrators."
          );
          router.push("/dashboard/my-school");
          return;
        }
        setCurrentUser(user);
        setCheckingAccess(false);
        setLoading(false);
      } catch (error) {
        toast.error("Failed to verify access");
        router.push("/dashboard");
      }
    };

    checkAccess();
  }, [router]);

  // Load users for General Public tab
  const loadGeneralPublicUsers = async (force = false) => {
    if (!force && generalPublicUsers.length > 0) return; // Already loaded

    setLoadingGeneralPublic(true);
    try {
      const users = await listPublicUsers();
      setGeneralPublicUsers(users);
    } catch (error) {
      toast.error("Failed to load general public users");
      console.error(error);
    } finally {
      setLoadingGeneralPublic(false);
    }
  };

  // Load users for Coordinators tab (SchoolAdmin + SchoolStaff)
  const loadCoordinatorUsers = async (force = false) => {
    if (!force && coordinatorUsers.length > 0) return; // Already loaded

    setLoadingCoordinators(true);
    try {
      const [schoolAdmins, schoolStaff] = await Promise.all([
        listSchoolAdmins(),
        listSchoolStaffUsers(),
      ]);
      // Combine both groups
      setCoordinatorUsers([...schoolAdmins, ...schoolStaff]);
    } catch (error) {
      toast.error("Failed to load coordinators");
      console.error(error);
    } finally {
      setLoadingCoordinators(false);
    }
  };

  // Load users for CTVET Staff tab
  const loadCtvetStaffUsers = async (force = false) => {
    if (!force && ctvetStaffUsers.length > 0) return; // Already loaded

    setLoadingCtvetStaff(true);
    try {
      // Fetch with maximum allowed page size (100) to get as many users as possible
      // For now, we'll get the first 100 CTVET Staff users
      // If more are needed, pagination should be implemented
      const response = await listCtvetStaffUsers({
        page: 1,
        page_size: 100, // Maximum allowed by backend
      });
      setCtvetStaffUsers(response.items);
    } catch (error) {
      toast.error("Failed to load CTVET staff users");
      console.error(error);
    } finally {
      setLoadingCtvetStaff(false);
    }
  };

  // Load users when tab changes
  useEffect(() => {
    if (checkingAccess || loading) return;

    switch (activeTab) {
      case "general-public":
        if (generalPublicUsers.length === 0) {
          loadGeneralPublicUsers();
        }
        break;
      case "coordinators":
        if (coordinatorUsers.length === 0) {
          loadCoordinatorUsers();
        }
        break;
      case "ctvet-staff":
        if (ctvetStaffUsers.length === 0) {
          loadCtvetStaffUsers();
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, checkingAccess, loading]);

  // Reload current tab's users
  const reloadCurrentTab = () => {
    switch (activeTab) {
      case "general-public":
        loadGeneralPublicUsers(true); // Force reload
        break;
      case "coordinators":
        loadCoordinatorUsers(true); // Force reload
        break;
      case "ctvet-staff":
        loadCtvetStaffUsers(true); // Force reload
        break;
    }
  };

  const handleCreateSuccess = () => {
    reloadCurrentTab();
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
      reloadCurrentTab();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setResetPasswordDialogOpen(true);
  };

  const handleResetPasswordSuccess = () => {
    reloadCurrentTab();
  };

  const handleToggleActive = async (user: User) => {
    try {
      await updateAdminUser(user.id, { is_active: !user.is_active });
      toast.success(
        `User ${user.is_active ? "deactivated" : "activated"} successfully`
      );
      reloadCurrentTab();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update user"
      );
    }
  };

  if (checkingAccess || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Back Button, Action Buttons, and Permissions Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Manage users and system settings
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setBulkUploadDialogOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/admin/permissions")}
            className="flex items-center gap-2"
          >
            <SettingsIcon className="h-4 w-4" />
            Permissions
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as UserGroupTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general-public">General Public</TabsTrigger>
          <TabsTrigger value="coordinators">Coordinators</TabsTrigger>
          <TabsTrigger value="ctvet-staff">CTVET Staff</TabsTrigger>
        </TabsList>

        {/* General Public Tab */}
        <TabsContent value="general-public" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>General Public Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-6">
                <AdminUserTable
                  users={generalPublicUsers}
                  loading={loadingGeneralPublic}
                  currentUserId={currentUser?.id}
                  onEdit={handleEdit}
                  onResetPassword={handleResetPassword}
                  onToggleActive={handleToggleActive}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coordinators Tab */}
        <TabsContent value="coordinators" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Coordinators</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                School Administrators and School Staff
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-6">
                <AdminUserTable
                  users={coordinatorUsers}
                  loading={loadingCoordinators}
                  currentUserId={currentUser?.id}
                  onEdit={handleEdit}
                  onResetPassword={handleResetPassword}
                  onToggleActive={handleToggleActive}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CTVET Staff Tab */}
        <TabsContent value="ctvet-staff" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>CTVET Staff</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                System Administrators, Directors, Managers, and Staff
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-6">
                <AdminUserTable
                  users={ctvetStaffUsers}
                  loading={loadingCtvetStaff}
                  currentUserId={currentUser?.id}
                  onEdit={handleEdit}
                  onResetPassword={handleResetPassword}
                  onToggleActive={handleToggleActive}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
