"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSchool } from "@/lib/api";
import { toast } from "sonner";
import type { SchoolRegion, SchoolZone } from "@/types/document";

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

export default function NewSchoolPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    region: "" as SchoolRegion | "",
    zone: "" as SchoolZone | "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.region || !formData.zone) {
        toast.error("Please select both region and zone");
        setLoading(false);
        return;
      }

      await createSchool({
        code: formData.code,
        name: formData.name,
        region: formData.region,
        zone: formData.zone,
      });
      toast.success("School created successfully");
      router.push("/schools");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create school");
      console.error("Error creating school:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <DashboardLayout title="New School">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-6 py-4">
          <h1 className="text-lg font-semibold">Create New School</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                School Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="code"
                name="code"
                type="text"
                value={formData.code}
                onChange={handleChange}
                required
                maxLength={6}
                placeholder="Enter 6-character school code"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">School code must be exactly 6 characters</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                School Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={255}
                placeholder="Enter school name"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="region" className="text-sm font-medium">
                Region <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.region}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, region: value as SchoolRegion }))
                }
                disabled={loading}
                required
              >
                <SelectTrigger id="region" className="w-full">
                  <SelectValue placeholder="Select a region" />
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
              <label htmlFor="zone" className="text-sm font-medium">
                Zone <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.zone}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, zone: value as SchoolZone }))
                }
                disabled={loading}
                required
              >
                <SelectTrigger id="zone" className="w-full">
                  <SelectValue placeholder="Select a zone" />
                </SelectTrigger>
                <SelectContent>
                  {SCHOOL_ZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      Zone {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create School"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
