"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCreditBalance,
  listApiKeys,
  type CreditBalance,
  type ApiKey,
} from "@/lib/api";
import { Coins, Key, Search, Plus, TrendingUp, Activity, BarChart3 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ApiDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usageStats, setUsageStats] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [balance, keys] = await Promise.all([
        getCreditBalance(),
        listApiKeys(),
      ]);
      setCreditBalance(balance);
      setApiKeys(keys);

      // Calculate usage stats from API keys
      const totalRequests = keys.reduce((sum, key) => sum + key.total_requests, 0);
      const totalVerifications = keys.reduce((sum, key) => sum + key.total_verifications, 0);
      setUsageStats({
        total_requests: totalRequests,
        total_verifications: totalVerifications,
        requests_today: 0,
        requests_this_week: 0,
        requests_this_month: 0,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to load dashboard data");
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

  const activeKeys = apiKeys.filter((k) => k.is_active).length;
  const requestsToday = usageStats?.requests_today || 0;
  const requestsThisWeek = usageStats?.requests_this_week || 0;
  const requestsThisMonth = usageStats?.requests_this_month || 0;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              API Dashboard
            </h1>
            <p className="text-slate-600 mt-2 text-lg">
              Manage your API keys, credits, and verification requests
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/api/dashboard/api-keys">
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                <Key className="mr-2 h-4 w-4" />
                Create API Key
              </Button>
            </Link>
            {creditBalance && Number(creditBalance.balance || 0) < 10 && (
              <Link href="/api/dashboard/credits">
                <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Coins className="mr-2 h-4 w-4" />
                  Add Credits
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Credit Balance</CardTitle>
            <div className="rounded-full bg-blue-100 p-2">
              <Coins className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {creditBalance ? Number(creditBalance.balance || 0).toFixed(2) : "0.00"}
            </div>
            <p className="text-xs text-slate-600 mt-1">credits available</p>
            {creditBalance && Number(creditBalance.balance || 0) < 10 && (
              <p className="text-xs text-amber-600 mt-2 font-medium">⚠️ Low balance</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 to-white shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Active API Keys</CardTitle>
            <div className="rounded-full bg-indigo-100 p-2">
              <Key className="h-5 w-5 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-600">{activeKeys}</div>
            <p className="text-xs text-slate-600 mt-1">of {apiKeys.length} total keys</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-100 bg-gradient-to-br from-green-50 to-white shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Requests Today</CardTitle>
            <div className="rounded-full bg-green-100 p-2">
              <Activity className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{requestsToday}</div>
            <p className="text-xs text-slate-600 mt-1">
              {requestsThisWeek} this week, {requestsThisMonth} this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-white shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Total Requests</CardTitle>
            <div className="rounded-full bg-purple-100 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{usageStats?.total_requests || 0}</div>
            <p className="text-xs text-slate-600 mt-1">
              {usageStats?.total_verifications || 0} verifications completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card className="border-2 border-slate-200 hover:border-blue-300 transition-all shadow-md hover:shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-600" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600 mb-4">
              Create and manage API keys for programmatic access to the verification API. Each key has its own rate limits and usage tracking.
            </p>
            <Link href="/api/dashboard/api-keys">
              <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                <Key className="mr-2 h-4 w-4" />
                Manage API Keys
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-200 hover:border-green-300 transition-all shadow-md hover:shadow-xl">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-green-600" />
              Credits
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600 mb-4">
              Purchase credits to use the verification API. Each verification request costs 1 credit. Monitor your usage and purchase more as needed.
            </p>
            <Link href="/api/dashboard/credits">
              <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                <Coins className="mr-2 h-4 w-4" />
                Manage Credits
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-200 hover:border-purple-300 transition-all shadow-md hover:shadow-xl">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-purple-600" />
              Verify Results
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600 mb-4">
              Verify candidate examination results using the dashboard interface. Supports both single and bulk verification requests.
            </p>
            <Link href="/api/dashboard/verify">
              <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                <Search className="mr-2 h-4 w-4" />
                Verify Results
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {apiKeys.length > 0 && (
          <Card className="border-2 border-slate-200 shadow-md">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-600" />
                Recent API Keys
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {apiKeys.slice(0, 5).map((key) => (
                  <div
                    key={key.id}
                    className="flex justify-between items-center p-4 border-2 border-slate-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/50 transition-all"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{key.name}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        Prefix: <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">{key.key_prefix}</code>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {key.is_active ? (
                          <span className="text-green-600 font-medium">● Active</span>
                        ) : (
                          <span className="text-slate-400">○ Inactive</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-blue-600">{key.total_requests}</p>
                      <p className="text-xs text-slate-600">requests</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {key.last_used_at
                          ? `Last: ${new Date(key.last_used_at).toLocaleDateString()}`
                          : "Never used"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/api/dashboard/api-keys">
                <Button variant="outline" className="w-full mt-4 border-blue-300 text-blue-700 hover:bg-blue-50">
                  View All API Keys →
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick Links Card */}
        <Card className="border-2 border-slate-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Link href="/api/dashboard/analytics">
                <div className="p-4 border-2 border-slate-100 rounded-lg hover:border-indigo-200 hover:bg-indigo-50/50 transition-all cursor-pointer">
                  <p className="font-semibold text-slate-900">Usage Analytics</p>
                  <p className="text-sm text-slate-600 mt-1">View detailed usage statistics and trends</p>
                </div>
              </Link>
              <Link href="/api/dashboard/docs">
                <div className="p-4 border-2 border-slate-100 rounded-lg hover:border-indigo-200 hover:bg-indigo-50/50 transition-all cursor-pointer">
                  <p className="font-semibold text-slate-900">API Documentation</p>
                  <p className="text-sm text-slate-600 mt-1">Complete guide with code examples</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
