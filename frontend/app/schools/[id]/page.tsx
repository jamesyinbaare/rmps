"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  getSchoolById,
  updateSchool,
} from "@/lib/api";
import type { School, SchoolRegion, SchoolZone } from "@/types/document";
import { Building2, ArrowLeft, Edit, Users, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SCHOOL_REGIONS: SchoolRegion[] = [
  "Ashanti Region",
  "Bono Region",
  "Bono East Region",
  "Ahafo Region",
  "Central Region",
  "Eastern Region",
  "Greater Accra Region",
  "Northern Region",
  "North East Region",
  "Savannah Region",
  "Upper East Region",
  "Upper West Region",
  "Volta Region",
  "Oti Region",
  "Western Region",
  "Western North Region",
];

const SCHOOL_ZONES: SchoolZone[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
];

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id ? parseInt(params.id as string) : null;

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    region: "" as SchoolRegion | "",
    zone: "" as SchoolZone | "",
    school_type: "none" as "private" | "public" | null | "none",
  });
  const [editLoading, setEditLoading] = useState(false);

  // Load school data
  useEffect(() => {
    const loadSchool = async () => {
      if (!schoolId) {
        setError("Invalid school ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const schoolData = await getSchoolById(schoolId);
        if (!schoolData) {
          setError("School not found");
          setLoading(false);
          return;
        }
        setSchool(schoolData);
        // Initialize edit form
        setEditFormData({
          name: schoolData.name,
          region: schoolData.region,
          zone: schoolData.zone,
          school_type: schoolData.school_type || "none",
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load school"
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchool();
  }, [schoolId]);

  const handleSaveSchool = async () => {
    if (!school || !school.code) return;

    setEditLoading(true);
    try {
      const updateData: {
        name?: string;
        region?: SchoolRegion;
        zone?: SchoolZone;
        school_type?: "private" | "public" | null;
      } = {};

      if (editFormData.name !== school.name) {
        updateData.name = editFormData.name;
      }
      if (editFormData.region && editFormData.region !== school.region) {
        updateData.region = editFormData.region;
      }
      if (editFormData.zone && editFormData.zone !== school.zone) {
        updateData.zone = editFormData.zone;
      }
      const newSchoolType = editFormData.school_type === "none" ? null : editFormData.school_type;
      if (newSchoolType !== school.school_type) {
        updateData.school_type = newSchoolType;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info("No changes to save");
        setEditDialogOpen(false);
        return;
      }

      await updateSchool(school.code, updateData);
      toast.success("School updated successfully");

      // Reload school data
      const schoolData = await getSchoolById(schoolId!);
      if (schoolData) {
        setSchool(schoolData);
        setEditFormData({
          name: schoolData.name,
          region: schoolData.region,
          zone: schoolData.zone,
          school_type: schoolData.school_type || "none",
        });
      }

      setEditDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update school");
      console.error("Error updating school:", error);
    } finally {
      setEditLoading(false);
    }
  };


  if (loading) {
    return (
      <DashboardLayout title="School Details">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !school) {
    return (
      <DashboardLayout title="School Details">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
            {error || "School not found"}
          </div>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/schools")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Schools
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="School Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/schools")}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">{school.name}</h1>
              <p className="text-sm text-muted-foreground">Code: {school.code}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* School Details Card */}
          <div className="px-6 pt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>School Information</CardTitle>
                  <Dialog
                    open={editDialogOpen}
                    onOpenChange={(open) => {
                      setEditDialogOpen(open);
                      if (!open && school) {
                        // Reset form data when dialog closes
                        setEditFormData({
                          name: school.name,
                          region: school.region,
                          zone: school.zone,
                          school_type: school.school_type || "none",
                        });
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Edit School</DialogTitle>
                        <DialogDescription>
                          Update the school information. Fields marked with * are required.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label htmlFor="edit-name" className="text-sm font-medium">
                            School Name <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="edit-name"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            required
                            maxLength={255}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="edit-region" className="text-sm font-medium">
                            Region <span className="text-destructive">*</span>
                          </label>
                          <Select
                            value={editFormData.region}
                            onValueChange={(value) => setEditFormData({ ...editFormData, region: value as SchoolRegion })}
                          >
                            <SelectTrigger id="edit-region">
                              <SelectValue placeholder="Select region" />
                            </SelectTrigger>
                            <SelectContent>
                              {SCHOOL_REGIONS.map((region) => (
                                <SelectItem key={region} value={region}>
                                  {region}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="edit-zone" className="text-sm font-medium">
                            Zone <span className="text-destructive">*</span>
                          </label>
                          <Select
                            value={editFormData.zone}
                            onValueChange={(value) => setEditFormData({ ...editFormData, zone: value as SchoolZone })}
                          >
                            <SelectTrigger id="edit-zone">
                              <SelectValue placeholder="Select zone" />
                            </SelectTrigger>
                            <SelectContent>
                              {SCHOOL_ZONES.map((zone) => (
                                <SelectItem key={zone} value={zone}>
                                  {zone}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="edit-school-type" className="text-sm font-medium">
                            School Type
                          </label>
                          <Select
                            value={editFormData.school_type || "none"}
                            onValueChange={(value) => setEditFormData({ ...editFormData, school_type: value === "none" ? null : (value as "private" | "public") })}
                          >
                            <SelectTrigger id="edit-school-type">
                              <SelectValue placeholder="Select school type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not specified</SelectItem>
                              <SelectItem value="public">Public</SelectItem>
                              <SelectItem value="private">Private</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editLoading}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveSchool} disabled={editLoading}>
                          {editLoading ? "Saving..." : "Save Changes"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">School Code</p>
                    <p className="font-medium">{school.code}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">School Name</p>
                    <p className="font-medium">{school.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Region</p>
                    <p className="font-medium">{school.region}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Zone</p>
                    <p className="font-medium">{school.zone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">School Type</p>
                    <p className="font-medium">{school.school_type ? school.school_type.charAt(0).toUpperCase() + school.school_type.slice(1) : "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(school.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Navigation Cards */}
          <div className="px-6 pb-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Candidates Card */}
              <Card
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => router.push(`/schools/${schoolId}/candidates`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">Candidates</h3>
                      <p className="text-sm text-muted-foreground">View and manage school candidates</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Programmes Card */}
              <Card
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => router.push(`/schools/${schoolId}/programmes`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">Programmes</h3>
                      <p className="text-sm text-muted-foreground">Manage school programmes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
