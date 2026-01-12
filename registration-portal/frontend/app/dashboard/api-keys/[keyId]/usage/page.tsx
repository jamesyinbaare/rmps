"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApiKey, getApiKeyUsage, type ApiKey, type ApiKeyUsageStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export default function ApiKeyUsagePage() {
  const params = useParams();
  const router = useRouter();
  const keyId = params.keyId as string;
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [usage, setUsage] = useState<ApiKeyUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (keyId) {
      loadData();
    }
  }, [keyId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [keyData, usageData] = await Promise.all([
        getApiKey(keyId),
        getApiKeyUsage(keyId),
      ]);
      setApiKey(keyData);
      setUsage(usageData);
    } catch (error: any) {
      toast.error(error.message || "Failed to load usage data");
    } finally {
      setLoading(false);
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

  if (!apiKey || !usage) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p>API key not found</p>
            <Button onClick={() => router.push("/dashboard/api-keys")} className="mt-4">
              Back to API Keys
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => router.push("/dashboard/api-keys")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{apiKey.name}</h1>
          <p className="text-gray-600">Usage Statistics</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usage.total_requests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Total Verifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usage.total_verifications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Requests Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usage.requests_today}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usage.requests_this_month}</div>
          </CardContent>
        </Card>
      </div>

      {usage.average_duration_ms && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">Average Response Time</div>
            <div className="text-2xl font-bold">{usage.average_duration_ms.toFixed(2)} ms</div>
          </CardContent>
        </Card>
      )}

      {usage.last_used_at && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Last Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">Last Used</div>
            <div className="text-lg font-medium">
              {new Date(usage.last_used_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
