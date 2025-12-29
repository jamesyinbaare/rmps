"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listDocuments } from "@/lib/api";
import { Files, Upload, AlertCircle, CheckCircle2, Clock, ArrowRight } from "lucide-react";

export default function Home() {
  const [stats, setStats] = useState({
    total: 0,
    recent: 0,
    failed: 0,
    success: 0,
    pending: 0,
    loading: true,
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        // Get total documents
        const totalResponse = await listDocuments({ page: 1, page_size: 1 });

        // Get failed extractions
        const failedResponse = await listDocuments({
          id_extraction_status: "error",
          page: 1,
          page_size: 1
        });

        // Get successful extractions
        const successResponse = await listDocuments({
          id_extraction_status: "success",
          page: 1,
          page_size: 1
        });

        // Get pending extractions
        const pendingResponse = await listDocuments({
          id_extraction_status: "pending",
          page: 1,
          page_size: 1
        });

        setStats({
          total: totalResponse.total,
          recent: 0, // Could calculate from uploaded_at if needed
          failed: failedResponse.total,
          success: successResponse.total,
          pending: pendingResponse.total,
          loading: false,
        });
      } catch (error) {
        console.error("Error loading stats:", error);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };

    loadStats();
  }, []);

  const statCards = [
    {
      title: "Total Documents",
      value: stats.loading ? "..." : stats.total.toLocaleString(),
      description: "All documents in system",
      icon: Files,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      href: "/documents",
    },
    {
      title: "Successful Extractions",
      value: stats.loading ? "..." : stats.success.toLocaleString(),
      description: "IDs extracted successfully",
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950",
      href: "/documents",
    },
    {
      title: "Pending Processing",
      value: stats.loading ? "..." : stats.pending.toLocaleString(),
      description: "Awaiting extraction",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
      href: "/documents",
    },
    {
      title: "Failed Extractions",
      value: stats.loading ? "..." : stats.failed.toLocaleString(),
      description: "Requires attention",
      icon: AlertCircle,
      color: "text-red-600",
      bgColor: "bg-red-50 dark:bg-red-950",
      href: "/documents/failed-extractions",
    },
  ];

  const quickActions = [
    {
      title: "All Documents",
      description: "View and manage all documents",
      href: "/documents",
      icon: Files,
    },
    {
      title: "Recent Files",
      description: "Recently uploaded documents",
      href: "/documents?filter=recent",
      icon: Clock,
    },
    {
      title: "Upload Documents",
      description: "Upload new scanned ICMs",
      href: "/documents",
      icon: Upload,
      action: "upload",
    },
    {
      title: "Generate ICMs",
      description: "Generate new ICM documents",
      href: "/home/generate-icms",
      icon: Files,
    },
  ];

  return (
    <DashboardLayout title="ICM Studio">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="ICM Studio" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-8">
            {/* Welcome Section */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Welcome to ICM Studio</h1>
              <p className="text-muted-foreground">
                Document Tracking System for Certificate II Examination
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Link key={stat.title} href={stat.href}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <div className={`p-2 rounded-md ${stat.bgColor}`}>
                          <Icon className={`h-4 w-4 ${stat.color}`} />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {stat.description}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Quick Actions</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link key={action.title} href={action.href}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{action.title}</CardTitle>
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <CardDescription>{action.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center text-sm text-primary">
                            Open <ArrowRight className="h-4 w-4 ml-1" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
