"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
  getApiKeyUsage,
  type ApiKey,
  type ApiKeyCreateResponse,
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
import { Key, Plus, Trash2, Copy, Edit, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [newKey, setNewKey] = useState<ApiKeyCreateResponse | null>(null);
  const [keyName, setKeyName] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const router = useRouter();

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const keys = await listApiKeys();
      setApiKeys(keys);
    } catch (error: any) {
      toast.error(error.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await createApiKey({
        name: keyName,
        rate_limit_per_minute: rateLimit,
      });
      setNewKey(response);
      setKeyName("");
      setRateLimit(60);
      await loadApiKeys();
      toast.success("API key created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create API key");
    }
  };

  const handleDelete = async (keyId: string) => {
    try {
      await deleteApiKey(keyId);
      await loadApiKeys();
      toast.success("API key deleted");
      setDeleteDialogOpen(false);
      setSelectedKey(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete API key");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleUpdate = async (keyId: string, updates: { name?: string; rate_limit_per_minute?: number; is_active?: boolean }) => {
    try {
      await updateApiKey(keyId, updates);
      await loadApiKeys();
      toast.success("API key updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update API key");
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

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-gray-600 mt-1">Manage your API keys for programmatic access</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Create a new API key to access the verification API programmatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="My API Key"
                />
              </div>
              <div>
                <Label htmlFor="rate-limit">Rate Limit (per minute)</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(parseInt(e.target.value) || 60)}
                  min={1}
                  max={1000}
                />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!keyName.trim()}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {newKey && (
        <Card className="mb-6 border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              API Key Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Your API key has been created. Copy it now - you won't be able to see it again!
            </p>
            <div className="flex items-center gap-2">
              <Input value={newKey.api_key} readOnly className="font-mono" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(newKey.api_key)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="mt-4"
              onClick={() => {
                setNewKey(null);
                setCreateDialogOpen(false);
              }}
            >
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {apiKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No API Keys</h3>
            <p className="text-gray-600 mb-4">Create your first API key to get started</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {apiKeys.map((key) => (
            <Card key={key.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {key.name}
                      {!key.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          Inactive
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Prefix: <code className="bg-gray-100 px-1 rounded">{key.key_prefix}</code>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/dashboard/api-keys/${key.id}/usage`)}
                    >
                      Usage
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newName = prompt("Enter new name:", key.name);
                        if (newName && newName !== key.name) {
                          handleUpdate(key.id, { name: newName });
                        }
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedKey(key);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium">
                      {new Date(key.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Last Used</p>
                    <p className="font-medium">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Rate Limit</p>
                    <p className="font-medium">{key.rate_limit_per_minute}/min</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Requests</p>
                    <p className="font-medium">{key.total_requests}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedKey?.name}"? This action cannot be undone.
              Any applications using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedKey && handleDelete(selectedKey.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
