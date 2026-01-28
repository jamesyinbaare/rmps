"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getApplications } from "@/lib/api";
import type { ExaminerApplicationResponse, ExaminerApplicationStatus } from "@/types";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ExaminerApplicationResponse[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<ExaminerApplicationResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExaminerApplicationStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadApplications = async () => {
      try {
        const apps = await getApplications();
        setApplications(apps);
        setFilteredApplications(apps);
      } catch (error) {
        console.error("Failed to load applications:", error);
      } finally {
        setLoading(false);
      }
    };

    loadApplications();
  }, []);

  useEffect(() => {
    if (statusFilter === "ALL") {
      setFilteredApplications(applications);
    } else {
      setFilteredApplications(applications.filter((app) => app.status === statusFilter));
    }
  }, [statusFilter, applications]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "secondary";
      case "SUBMITTED":
        return "default";
      case "UNDER_REVIEW":
        return "default";
      case "ACCEPTED":
        return "default";
      case "REJECTED":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Applications</h1>
          <p className="text-muted-foreground">View and manage your examiner applications</p>
        </div>
        <Link href="/dashboard/applications/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Application
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Applications</CardTitle>
              <CardDescription>
                {filteredApplications.length} application{filteredApplications.length !== 1 ? "s" : ""} found
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ExaminerApplicationStatus | "ALL")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredApplications.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No applications found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {statusFilter === "ALL"
                  ? "Get started by creating your first examiner application"
                  : `No applications with status "${statusFilter}"`}
              </p>
              {statusFilter === "ALL" &&
                !applications.some(
                  (app) =>
                    app.status === "SUBMITTED" ||
                    app.status === "UNDER_REVIEW" ||
                    app.status === "ACCEPTED"
                ) && (
                  <Link href="/dashboard/applications/new">
                    <Button className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Application
                    </Button>
                  </Link>
                )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApplications.map((app) => (
                <Link
                  key={app.id}
                  href={`/dashboard/applications/${app.id}`}
                  className="block rounded-lg border p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{app.application_number}</h3>
                        <Badge variant={getStatusBadgeVariant(app.status)}>
                          {app.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {app.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(app.created_at).toLocaleDateString()}
                        {app.submitted_at && (
                          <> • Submitted: {new Date(app.submitted_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
