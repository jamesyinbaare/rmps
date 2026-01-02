"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SchoolProfileHeader } from "@/components/admin/SchoolProfileHeader";
import { SchoolStatistics } from "@/components/admin/SchoolStatistics";
import { CoordinatorsSection } from "@/components/admin/CoordinatorsSection";
import { SchoolRegistrationsSection } from "@/components/admin/SchoolRegistrationsSection";
import { SchoolExamsSection } from "@/components/admin/SchoolExamsSection";
import { EditSchoolDialog } from "@/components/admin/EditSchoolDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSchool, getSchoolStatistics } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Settings, Users, GraduationCap, BookOpen } from "lucide-react";
import type { SchoolDetail, SchoolStatistics as SchoolStatisticsType } from "@/types";

type Tab = "overview" | "admins" | "registrations" | "exams" | "settings";

export default function SchoolProfilePage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = parseInt(params.id as string);

  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [statistics, setStatistics] = useState<SchoolStatisticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const loadSchoolData = async () => {
    if (isNaN(schoolId)) {
      toast.error("Invalid school ID");
      router.push("/dashboard/schools");
      return;
    }

    setLoading(true);
    try {
      const [schoolData, statsData] = await Promise.all([
        getSchool(schoolId),
        getSchoolStatistics(schoolId),
      ]);
      setSchool(schoolData);
      setStatistics(statsData);
    } catch (error) {
      toast.error("Failed to load school data");
      console.error(error);
      router.push("/dashboard/schools");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchoolData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading school data...</div>
      </div>
    );
  }

  if (!school || !statistics) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">School not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push("/dashboard/schools")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Schools
      </Button>

      {/* Header */}
      <SchoolProfileHeader school={school} />

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === "overview" ? "default" : "ghost"}
          onClick={() => setActiveTab("overview")}
          className="rounded-b-none"
        >
          Overview
        </Button>
        <Button
          variant={activeTab === "admins" ? "default" : "ghost"}
          onClick={() => setActiveTab("admins")}
          className="rounded-b-none"
        >
          <Users className="mr-2 h-4 w-4" />
          Coordinators
        </Button>
        <Button
          variant={activeTab === "registrations" ? "default" : "ghost"}
          onClick={() => setActiveTab("registrations")}
          className="rounded-b-none"
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Registrations
        </Button>
        <Button
          variant={activeTab === "exams" ? "default" : "ghost"}
          onClick={() => setActiveTab("exams")}
          className="rounded-b-none"
        >
          <BookOpen className="mr-2 h-4 w-4" />
          Exams
        </Button>
        <Button
          variant={activeTab === "settings" ? "default" : "ghost"}
          onClick={() => setActiveTab("settings")}
          className="rounded-b-none"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <div className="space-y-6">
            <SchoolStatistics statistics={statistics} />
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">School Code</h3>
                    <p className="text-lg font-semibold">{school.code}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">School Name</h3>
                    <p className="text-lg font-semibold">{school.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                    <p className="text-lg font-semibold">
                      {school.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Created</h3>
                    <p className="text-lg font-semibold">
                      {new Date(school.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "admins" && <CoordinatorsSection schoolId={schoolId} />}

        {activeTab === "registrations" && <SchoolRegistrationsSection schoolId={schoolId} />}

        {activeTab === "exams" && <SchoolExamsSection schoolId={schoolId} />}

        {activeTab === "settings" && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-4">School Settings</h3>
                  <Button onClick={() => setEditDialogOpen(true)}>Edit School Details</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <EditSchoolDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        school={school}
        onSuccess={loadSchoolData}
      />
    </div>
  );
}
