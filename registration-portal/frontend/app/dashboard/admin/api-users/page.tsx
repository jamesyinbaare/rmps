"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listApiUsers,
  createApiUser,
  updateApiUser,
  deactivateApiUser,
  type ApiUserListItem,
  type ApiUserListResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Plus, Eye, Edit, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export default function ApiUsersPage() {
  const router = useRouter();
  const [apiUsers, setApiUsers] = useState<ApiUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ApiUserListItem | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | null>(null);

  useEffect(() => {
    loadApiUsers();
  }, [page, search, isActiveFilter]);

  const loadApiUsers = async () => {
    try {
      setLoading(true);
      const response = await listApiUsers({
        page,
        page_size: 20,
        search: search || undefined,
        is_active: isActiveFilter !== null ? isActiveFilter : undefined,
      });
      setApiUsers(response.items);
      setTotalPages(response.total_pages);
    } catch (error: any) {
      toast.error(error.message || "Failed to load API users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (email: string, password: string, fullName: string) => {
    try {
      await createApiUser({ email, password, full_name: fullName });
      await loadApiUsers();
      setCreateDialogOpen(false);
      toast.success("API user created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create API user");
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await deactivateApiUser(userId, false);
      await loadApiUsers();
      toast.success("API user deactivated");
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate API user");
    }
  };

  const handleToggleActive = async (user: ApiUserListItem) => {
    try {
      await updateApiUser(user.id, { is_active: !user.is_active });
      await loadApiUsers();
      toast.success(`API user ${!user.is_active ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to update API user");
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">API Users</h1>
          <p className="text-gray-600 mt-1">Manage API user accounts and access</p>
        </div>
        <CreateApiUserDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleCreate}
        />
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by email or name..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={isActiveFilter === null ? "all" : isActiveFilter ? "active" : "inactive"}
              onChange={(e) => {
                const value = e.target.value;
                setIsActiveFilter(
                  value === "all" ? null : value === "active" ? true : false
                );
                setPage(1);
              }}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Users</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>API Users ({apiUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : apiUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-600">No API users found</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credit Balance</TableHead>
                    <TableHead>API Keys</TableHead>
                    <TableHead>Total Requests</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            user.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {Number(user.credit_balance || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {user.active_api_keys} / {user.total_api_keys}
                      </TableCell>
                      <TableCell>{user.total_requests}</TableCell>
                      <TableCell>
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/dashboard/admin/api-users/${user.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate API User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate "{selectedUser?.email}"? This will prevent them from accessing the API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && handleDeactivate(selectedUser.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateApiUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (email: string, password: string, fullName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = () => {
    if (!email || !password || !fullName) {
      toast.error("Please fill in all fields");
      return;
    }
    onSuccess(email, password, fullName);
    setEmail("");
    setPassword("");
    setFullName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create API User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New API User</DialogTitle>
          <DialogDescription>
            Create a new API user account. The user will be able to create API keys and use the verification API.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
            />
          </div>
          <Button onClick={handleSubmit} className="w-full">
            Create API User
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
