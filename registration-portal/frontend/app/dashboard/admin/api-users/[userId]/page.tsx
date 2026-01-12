"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getApiUser,
  updateApiUser,
  assignCreditsToApiUser,
  getApiUserUsage,
  type ApiUserDetail,
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
import { ArrowLeft, Edit, Coins, BarChart3, Key } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function ApiUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [userDetail, setUserDetail] = useState<ApiUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(10);
  const [creditDescription, setCreditDescription] = useState("");

  useEffect(() => {
    if (userId) {
      loadUserDetail();
    }
  }, [userId]);

  const loadUserDetail = async () => {
    try {
      setLoading(true);
      const detail = await getApiUser(userId);
      setUserDetail(detail);
    } catch (error: any) {
      toast.error(error.message || "Failed to load user details");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (fullName?: string, isActive?: boolean) => {
    try {
      await updateApiUser(userId, { full_name: fullName, is_active: isActive });
      await loadUserDetail();
      setEditDialogOpen(false);
      toast.success("User updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleAssignCredits = async () => {
    try {
      await assignCreditsToApiUser(userId, creditAmount, creditDescription);
      await loadUserDetail();
      setCreditDialogOpen(false);
      setCreditAmount(10);
      setCreditDescription("");
      toast.success(`Assigned ${creditAmount} credits`);
    } catch (error: any) {
      toast.error(error.message || "Failed to assign credits");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!userDetail) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p>User not found</p>
            <Button onClick={() => router.push("/dashboard/admin/api-users")} className="mt-4">
              Back to API Users
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => router.push("/dashboard/admin/api-users")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{userDetail.user.full_name}</h1>
          <p className="text-gray-600">{userDetail.user.email}</p>
        </div>
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit API User</DialogTitle>
              <DialogDescription>Update user information</DialogDescription>
            </DialogHeader>
            <EditUserForm
              user={userDetail.user}
              onSave={(fullName, isActive) => handleUpdate(fullName, isActive)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Credit Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Number(userDetail.credit_balance.balance || 0).toFixed(2)}
            </div>
            <p className="text-sm text-gray-600 mt-1">credits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{userDetail.api_keys.length}</div>
            <p className="text-sm text-gray-600 mt-1">total keys</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{userDetail.usage_stats.total_requests}</div>
            <p className="text-sm text-gray-600 mt-1">requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={`px-3 py-1 rounded text-sm font-medium ${
                userDetail.user.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {userDetail.user.is_active ? "Active" : "Inactive"}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{userDetail.user.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Full Name</p>
              <p className="font-medium">{userDetail.user.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="font-medium">
                {new Date(userDetail.user.created_at).toLocaleString()}
              </p>
            </div>
            {userDetail.user.last_login && (
              <div>
                <p className="text-sm text-gray-600">Last Login</p>
                <p className="font-medium">
                  {new Date(userDetail.user.last_login).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Credit Information</CardTitle>
            <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Coins className="mr-2 h-4 w-4" />
                  Assign Credits
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Credits</DialogTitle>
                  <DialogDescription>
                    Assign credits to this API user account
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                      min={1}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      value={creditDescription}
                      onChange={(e) => setCreditDescription(e.target.value)}
                      placeholder="Reason for credit assignment"
                    />
                  </div>
                  <Button onClick={handleAssignCredits} className="w-full">
                    Assign Credits
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-gray-600">Current Balance</p>
              <p className="text-2xl font-bold">{Number(userDetail.credit_balance.balance || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Purchased</p>
              <p className="font-medium">{Number(userDetail.credit_balance.total_purchased || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Used</p>
              <p className="font-medium">{Number(userDetail.credit_balance.total_used || 0).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold">{userDetail.usage_stats.total_requests}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Verifications</p>
              <p className="text-2xl font-bold">{userDetail.usage_stats.total_verifications}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Requests Today</p>
              <p className="text-2xl font-bold">{userDetail.usage_stats.requests_today}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">This Month</p>
              <p className="text-2xl font-bold">{userDetail.usage_stats.requests_this_month}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {userDetail.api_keys.length === 0 ? (
            <p className="text-gray-600">No API keys created yet</p>
          ) : (
            <div className="space-y-2">
              {userDetail.api_keys.map((key) => (
                <div
                  key={key.id}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-sm text-gray-600">
                      Prefix: <code className="bg-gray-100 px-1 rounded">{key.key_prefix}</code>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{key.total_requests} requests</p>
                    <p className="text-xs text-gray-600">
                      {key.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EditUserForm({
  user,
  onSave,
}: {
  user: { full_name: string; is_active: boolean };
  onSave: (fullName: string, isActive: boolean) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [isActive, setIsActive] = useState(user.is_active);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="isActive">Active</Label>
      </div>
      <Button onClick={() => onSave(fullName, isActive)} className="w-full">
        Save Changes
      </Button>
    </div>
  );
}
