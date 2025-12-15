"use client";

import { useState, useEffect } from "react";
import { SchoolDataTable } from "@/components/SchoolDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { listSchools } from "@/lib/api";
import type { School } from "@/types/document";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all schools once (fetch in batches since backend limits page_size to 100)
  useEffect(() => {
    const loadAllSchools = async () => {
      setLoading(true);
      try {
        const allSchoolsList: School[] = [];
        let page = 1;
        let hasMore = true;

        // Fetch schools in batches of 100 (backend limit)
        while (hasMore) {
          const schools = await listSchools(page, 100);
          allSchoolsList.push(...schools);
          hasMore = schools.length === 100;
          page++;
        }

        setSchools(allSchoolsList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schools");
        console.error("Error loading schools:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAllSchools();
  }, []);

  return (
    <DashboardLayout title="Schools">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="All Schools" />
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Total Schools Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Total Schools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? "..." : schools.length}</div>
            </CardContent>
          </Card>

          {/* Schools DataTable */}
          <SchoolDataTable schools={schools} loading={loading} />
        </div>
      </div>
    </DashboardLayout>
  );
}
