"use client";

import { useState, useEffect } from "react";
import { SchoolDataTable } from "@/components/SchoolDataTable";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { AddSchoolDialog } from "@/components/AddSchoolDialog";
import { listSchools } from "@/lib/api";
import type { School } from "@/types/document";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, School as SchoolIcon } from "lucide-react";

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    // Reload schools after addition
    const loadAllSchools = async () => {
      setLoading(true);
      try {
        const allSchoolsList: School[] = [];
        let page = 1;
        let hasMore = true;

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
  };

  // Calculate statistics
  const totalSchools = schools.length;
  const publicSchools = schools.filter((s) => s.school_type === "public").length;
  const privateSchools = schools.filter((s) => s.school_type === "private").length;

  return (
    <DashboardLayout title="Schools">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="All Schools" />
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Statistics Cards */}
          <div className="px-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Schools Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Total Schools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{loading ? "..." : totalSchools}</div>
              </CardContent>
            </Card>

            {/* Public Schools Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SchoolIcon className="h-5 w-5" />
                  Public Schools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{loading ? "..." : publicSchools}</div>
              </CardContent>
            </Card>

            {/* Private Schools Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SchoolIcon className="h-5 w-5" />
                  Private Schools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{loading ? "..." : privateSchools}</div>
              </CardContent>
            </Card>
            </div>

            {/* Add New School Button and DataTable */}
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New School
                </Button>
              </div>
              <SchoolDataTable schools={schools} loading={loading} />
            </div>
          </div>
        </div>
      </div>

      <AddSchoolDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />
    </DashboardLayout>
  );
}
