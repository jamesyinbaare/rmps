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
import { listDocuments, getAllExams, compareSheetIds } from "@/lib/api";
import type { Exam, SheetIdComparisonResponse } from "@/types/document";
import { Files, Upload, AlertCircle, CheckCircle2, Clock, ArrowRight, FileSearch, TrendingUp } from "lucide-react";

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
  const [sheetIdComparison, setSheetIdComparison] = useState<SheetIdComparisonResponse | null>(null);
  const [sheetIdLoading, setSheetIdLoading] = useState(false);
  const [documentsWithoutExtractedId, setDocumentsWithoutExtractedId] = useState<number>(0);
  const [documentsWithoutExtractedIdLoading, setDocumentsWithoutExtractedIdLoading] = useState(false);

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

  // Load sheet ID comparison when exam changes
  useEffect(() => {
    const loadSheetIdComparison = async () => {
      if (!selectedExamId) {
        setSheetIdComparison(null);
        return;
      }

      setSheetIdLoading(true);
      try {
        const comparison = await compareSheetIds(selectedExamId);
        setSheetIdComparison(comparison);
      } catch (error) {
        console.error("Error loading sheet ID comparison:", error);
        setSheetIdComparison(null);
      } finally {
        setSheetIdLoading(false);
      }
    };

    loadSheetIdComparison();
  }, [selectedExamId]);

  // Load documents without extracted_id when exam changes
  useEffect(() => {
    const loadDocumentsWithoutExtractedId = async () => {
      if (!selectedExamId) {
        setDocumentsWithoutExtractedId(0);
        return;
      }

      setDocumentsWithoutExtractedIdLoading(true);
      try {
        // Fetch documents for this exam and count those without extracted_id
        // Use maximum allowed page_size (100) and paginate if needed for accurate count
        let totalWithoutExtractedId = 0;
        let page = 1;
        const pageSize = 100; // Maximum allowed by API
        let hasMorePages = true;

        while (hasMorePages) {
          const response = await listDocuments({
            exam_id: selectedExamId,
            page,
            page_size: pageSize,
          });

          // Count documents without extracted_id in this page
          const withoutExtractedId = response.items.filter(doc => !doc.extracted_id).length;
          totalWithoutExtractedId += withoutExtractedId;

          // Check if we've fetched all documents
          if (page >= response.total_pages || response.items.length === 0) {
            hasMorePages = false;
          } else {
            page++;
          }

          // Limit pagination to prevent infinite loops (safety check)
          if (page > 100) {
            hasMorePages = false;
          }
        }

        setDocumentsWithoutExtractedId(totalWithoutExtractedId);
      } catch (error) {
        console.error("Error loading documents without extracted_id:", error);
        setDocumentsWithoutExtractedId(0);
      } finally {
        setDocumentsWithoutExtractedIdLoading(false);
      }
    };

    loadDocumentsWithoutExtractedId();
  }, [selectedExamId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const statCards = [
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
    ...(selectedExamId
      ? [
          {
            title: "Expected Sheets",
            value: sheetIdLoading ? "..." : sheetIdComparison?.total_expected_sheets.toLocaleString() || "0",
            description: "Sheets generated for this exam",
            icon: FileSearch,
            color: "text-blue-600",
            bgColor: "bg-blue-50 dark:bg-blue-950",
            href: selectedExamId ? `/icm-studio/track-icms?exam_id=${selectedExamId}&tab=expected` : "/icm-studio/track-icms?tab=expected",
          },
          {
            title: "Uploaded Sheets",
            value: sheetIdLoading ? "..." : sheetIdComparison?.total_uploaded_sheets.toLocaleString() || "0",
            description: "Documents uploaded successfully",
            icon: CheckCircle2,
            color: "text-green-600",
            bgColor: "bg-green-50 dark:bg-green-950",
            href: selectedExamId ? `/icm-studio/track-icms?exam_id=${selectedExamId}&tab=uploaded` : "/icm-studio/track-icms?tab=uploaded",
          },
          {
            title: "Missing Sheets",
            value: sheetIdLoading ? "..." : sheetIdComparison?.missing_sheet_ids.length.toLocaleString() || "0",
            description: "Expected but not uploaded",
            icon: AlertCircle,
            color: "text-red-600",
            bgColor: "bg-red-50 dark:bg-red-950",
            href: `/icm-studio/track-icms?exam_id=${selectedExamId}`,
          },
          {
            title: "Extra Sheets",
            value: (sheetIdLoading || documentsWithoutExtractedIdLoading)
              ? "..."
              : ((sheetIdComparison?.extra_sheet_ids.length || 0) + documentsWithoutExtractedId).toLocaleString(),
            description: "Uploaded but not expected, or documents without extracted_id",
            icon: TrendingUp,
            color: "text-yellow-600",
            bgColor: "bg-yellow-50 dark:bg-yellow-950",
            href: selectedExamId ? `/icm-studio/track-icms?exam_id=${selectedExamId}&tab=extra` : "/icm-studio/track-icms?tab=extra",
          },
        ]
      : []),
  ];

  const quickActions = [
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

            {/* Extraction Status Section */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Extraction Status</h2>
                <p className="text-sm text-muted-foreground">Document ID extraction progress</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                {statCards
                  .filter((stat) => !stat.title.includes("Sheet") && !stat.title.includes("Expected"))
                  .map((stat) => {
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
            </div>

            {/* Sheet Tracking Section */}
            {selectedExamId && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">Sheet Tracking</h2>
                  <p className="text-sm text-muted-foreground">Expected vs uploaded score sheets</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {statCards
                    .filter((stat) => stat.title.includes("Sheet") || stat.title.includes("Expected"))
                    .map((stat) => {
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
              </div>
            )}


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
