"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listDocuments, getAllExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Files, Upload, AlertCircle, CheckCircle2, Clock, ArrowRight } from "lucide-react";

export default function ICMStudioPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    recent: 0,
    failed: 0,
    success: 0,
    pending: 0,
    loading: true,
  });

  // Load all exams and set default to newest
  useEffect(() => {
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        setExams(allExams);

        // Find newest exam by created_at
        if (allExams.length > 0) {
          const newestExam = allExams.reduce((newest, current) => {
            const newestDate = new Date(newest.created_at);
            const currentDate = new Date(current.created_at);
            return currentDate > newestDate ? current : newest;
          });
          setSelectedExamId(newestExam.id);
        }
      } catch (error) {
        console.error("Error loading exams:", error);
      }
    };

    loadExams();
  }, []);

  // Load stats when exam changes
  useEffect(() => {
    const loadStats = async () => {
      if (!selectedExamId) {
        setStats({
          total: 0,
          recent: 0,
          failed: 0,
          success: 0,
          pending: 0,
          loading: false,
        });
        return;
      }

      setStats((prev) => ({ ...prev, loading: true }));
      try {
        // Get total documents for this exam
        const totalResponse = await listDocuments({
          exam_id: selectedExamId,
          page: 1,
          page_size: 1
        });

        // Get failed extractions for this exam
        const failedResponse = await listDocuments({
          exam_id: selectedExamId,
          id_extraction_status: "error",
          page: 1,
          page_size: 1
        });

        // Get successful extractions for this exam
        const successResponse = await listDocuments({
          exam_id: selectedExamId,
          id_extraction_status: "success",
          page: 1,
          page_size: 1
        });

        // Get pending extractions for this exam
        const pendingResponse = await listDocuments({
          exam_id: selectedExamId,
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
  }, [selectedExamId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const statCards = [
    {
      title: "Total Documents",
      value: stats.loading ? "..." : stats.total.toLocaleString(),
      description: "All documents in system",
      icon: Files,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      href: selectedExamId ? `/icm-studio/documents?exam_id=${selectedExamId}` : "/icm-studio/documents",
    },
    {
      title: "Successful Extractions",
      value: stats.loading ? "..." : stats.success.toLocaleString(),
      description: "IDs extracted successfully",
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950",
      href: selectedExamId ? `/icm-studio/documents?exam_id=${selectedExamId}` : "/icm-studio/documents",
    },
    {
      title: "Pending Processing",
      value: stats.loading ? "..." : stats.pending.toLocaleString(),
      description: "Awaiting extraction",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
      href: selectedExamId ? `/icm-studio/documents?exam_id=${selectedExamId}` : "/icm-studio/documents",
    },
    {
      title: "Failed Extractions",
      value: stats.loading ? "..." : stats.failed.toLocaleString(),
      description: "Requires attention",
      icon: AlertCircle,
      color: "text-red-600",
      bgColor: "bg-red-50 dark:bg-red-950",
      href: "/icm-studio/documents/failed-extractions",
    },
  ];

  const quickActions = [
    {
      title: "All Documents",
      description: "View and manage all documents",
      href: selectedExamId ? `/icm-studio/documents?exam_id=${selectedExamId}` : "/icm-studio/documents",
      icon: Files,
    },
    {
      title: "Recent Files",
      description: "Recently uploaded documents",
      href: selectedExamId ? `/icm-studio/documents?exam_id=${selectedExamId}&filter=recent` : "/icm-studio/documents?filter=recent",
      icon: Clock,
    },
    {
      title: "Upload Documents",
      description: "Upload new scanned ICMs",
      href: "/icm-studio/documents",
      icon: Upload,
      action: "upload",
    },
    {
      title: "Generate ICMs",
      description: "Generate new ICM documents",
      href: "/icm-studio/generate-icms",
      icon: Files,
    },
  ];

  const formatExamLabel = (exam: Exam) => {
    return `${exam.exam_type} - ${exam.series} ${exam.year}`;
  };

  return (
    <DashboardLayout title="ICM Studio">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="ICM Studio" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-8">
            {/* Welcome Section with Examination Selector */}
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome to ICM Studio</h1>
                <p className="text-muted-foreground">
                  Document Tracking System for Certificate II Examination
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* <label htmlFor="exam-select" className="text-sm font-medium text-muted-foreground">
                  Examination:
                </label> */}
                <Select
                  value={selectedExamId?.toString() || ""}
                  onValueChange={(value) => setSelectedExamId(parseInt(value))}
                >
                  <SelectTrigger id="exam-select" className="w-[280px]">
                    <SelectValue placeholder="Select examination" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {formatExamLabel(exam)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedExam && (
              <div className="text-sm text-muted-foreground">
                Showing statistics for: <span className="font-medium text-foreground">{formatExamLabel(selectedExam)}</span>
              </div>
            )}

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
