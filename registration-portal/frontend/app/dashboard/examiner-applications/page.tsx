"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listExaminerApplications, type ExaminerApplication } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, FileText, Clock, CheckCircle, XCircle } from "lucide-react";

export default function ExaminerApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<ExaminerApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const data = await listExaminerApplications();
      setApplications(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="default">Submitted</Badge>;
      case "UNDER_REVIEW":
        return <Badge variant="secondary">Under Review</Badge>;
      case "ACCEPTED":
        return <Badge className="bg-green-500">Accepted</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <FileText className="h-4 w-4" />;
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return <Clock className="h-4 w-4" />;
      case "ACCEPTED":
        return <CheckCircle className="h-4 w-4" />;
      case "REJECTED":
        return <XCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Examiner Applications</h1>
          <p className="text-muted-foreground mt-2">Manage your examiner applications</p>
        </div>
        <Button onClick={() => router.push("/dashboard/examiner-applications/new")}>
          <Plus className="h-4 w-4 mr-2" />
          New Application
        </Button>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
            <p className="text-muted-foreground mb-4">Get started by creating a new examiner application</p>
            <Button onClick={() => router.push("/dashboard/examiner-applications/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Application
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card key={app.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/dashboard/examiner-applications/${app.id}`)}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(app.status)}
                      {app.application_number}
                    </CardTitle>
                    <CardDescription className="mt-1">{app.full_name}</CardDescription>
                  </div>
                  {getStatusBadge(app.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{app.email_address || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Submitted</p>
                    <p className="font-medium">{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : "Not submitted"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment</p>
                    <p className="font-medium">{app.payment_status || "Pending"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(app.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
