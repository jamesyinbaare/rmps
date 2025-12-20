"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { EditSubjectModal } from "@/components/EditSubjectModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSubject } from "@/lib/api";
import type { Subject } from "@/types/document";
import { ArrowLeft, BookOpen, Edit, Calendar } from "lucide-react";

export default function SubjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subjectId = params.id ? parseInt(params.id as string) : null;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Load subject data
  useEffect(() => {
    const loadSubject = async () => {
      if (!subjectId) {
        setError("Invalid subject ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const subjectData = await getSubject(subjectId);
        setSubject(subjectData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subject");
        console.error("Error loading subject:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSubject();
  }, [subjectId]);

  const handleEditSuccess = async () => {
    if (!subjectId) return;
    try {
      const updatedSubject = await getSubject(subjectId);
      setSubject(updatedSubject);
    } catch (error) {
      console.error("Error refreshing subject:", error);
    }
    setEditModalOpen(false);
  };

  if (loading) {
    return (
      <DashboardLayout title="Subject Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Loading..." />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !subject) {
    return (
      <DashboardLayout title="Subject Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Error" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error || "Subject not found"}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/subjects")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Subjects
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Subject Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={`${subject.code} - ${subject.name}`} />
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header with back button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/subjects")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Subjects
            </Button>
          </div>

          {/* Subject Information Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Subject Information
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalOpen(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Code:</span>
                  <span className="text-sm font-medium font-mono">{subject.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Name:</span>
                  <span className="text-sm font-medium">{subject.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <Badge
                    variant={subject.subject_type === "CORE" ? "default" : "secondary"}
                  >
                    {subject.subject_type === "CORE" ? "Core" : "Elective"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Created:</span>
                  <span className="text-sm font-medium">
                    {new Date(subject.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditSubjectModal
        subject={subject}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={handleEditSuccess}
      />
    </DashboardLayout>
  );
}
