"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAdminApplications } from "@/lib/api";
import type {
  ExaminerApplicationResponse,
  ExaminerApplicationStatus,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText } from "lucide-react";

const STATUS_OPTIONS: { value: ExaminerApplicationStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
];

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<ExaminerApplicationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ExaminerApplicationStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = (pageOverride?: number) => {
    setLoading(true);
    const p = pageOverride ?? page;
    listAdminApplications({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      search: search.trim() || undefined,
      page: p,
      page_size: pageSize,
    })
      .then(setApplications)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load applications");
        setApplications([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Examiner Applications</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <form onSubmit={handleSearch} className="flex gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="search">Search (application number, name, email)</Label>
              <Input
                id="search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as ExaminerApplicationStatus | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : applications.length === 0 ? (
            <p className="text-muted-foreground">No applications found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium">Application #</th>
                    <th className="p-2 text-left font-medium">Name</th>
                    <th className="p-2 text-left font-medium">Subject</th>
                    <th className="p-2 text-left font-medium">Status</th>
                    <th className="p-2 text-left font-medium">Submitted</th>
                    <th className="p-2 text-left font-medium">Recommendation</th>
                    <th className="p-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id} className="border-b">
                      <td className="p-2 font-medium">{app.application_number}</td>
                      <td className="p-2">{app.full_name}</td>
                      <td className="p-2">
                        {app.subject ? `${app.subject.code} – ${app.subject.name}` : "—"}
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{app.status}</Badge>
                      </td>
                      <td className="p-2">
                        {app.submitted_at
                          ? new Date(app.submitted_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="p-2">
                        {app.recommendation_status?.completed
                          ? `Done${app.recommendation_status.recommender_name ? ` (${app.recommendation_status.recommender_name})` : ""}`
                          : "—"}
                      </td>
                      <td className="p-2">
                        <Button variant="link" size="sm" asChild>
                          <Link href={`/dashboard/admin/applications/${app.id}`}>
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {applications.length === pageSize && (
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-2 text-sm text-muted-foreground">
                Page {page}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
