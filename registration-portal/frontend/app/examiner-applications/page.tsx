"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, listExaminerApplications, type ExaminerApplication } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, FileText, Clock, CheckCircle, XCircle, UserCircle, LogOut } from "lucide-react";
import type { User } from "@/types";
import { logout } from "@/lib/api";

export default function ExaminerApplicationsDashboard() {
  const router = useRouter();
  const [applications, setApplications] = useState<ExaminerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const userData = await getCurrentUser();
      setUser(userData);
      const data = await listExaminerApplications();
      setApplications(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <UserCircle className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">Examiner Applications</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-sm text-muted-foreground">
                  {user.full_name}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">My Examiner Applications</h1>
            <p className="text-muted-foreground mt-2">Manage your applications to become an examiner</p>
          </div>
          {!applications.some(app => app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" || app.status === "ACCEPTED") && (
            <Button onClick={() => router.push("/examiner-applications/new")}>
              <Plus className="h-4 w-4 mr-2" />
              New Application
            </Button>
          )}
        </div>

        {applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating a new examiner application</p>
              <Button onClick={() => router.push("/examiner-applications/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Create Application
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => {
              const isDraft = app.status === "DRAFT";
              const hasSubmitted = applications.some(a => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW" || a.status === "ACCEPTED");

              return (
                <Card
                  key={app.id}
                  className={`${isDraft ? "border-l-4 border-l-primary" : ""} hover:shadow-md transition-shadow`}
                >
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
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
                    <div className="flex gap-2">
                      {isDraft ? (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/examiner-applications/new?draft=${app.id}`);
                          }}
                          className="flex-1 sm:flex-initial"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Continue Editing
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/examiner-applications/${app.id}`);
                          }}
                          className="flex-1 sm:flex-initial"
                        >
                          View Details
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {applications.some(app => app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" || app.status === "ACCEPTED") && (
          <Card className="mt-6 border-l-4 border-l-blue-500">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Application Submitted</h3>
                  <p className="text-sm text-muted-foreground">
                    You have already submitted an application. You can only submit one application at a time.
                    If you have a draft, you can continue editing it, but you cannot create a new application while you have a submitted one.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
