"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface AddSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddSchoolDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddSchoolDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    region: "" as SchoolRegion | "",
    zone: "" as SchoolZone | "",
    school_type: "none" as "private" | "public" | null | "none",
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

      if (formData.code.length !== 6) {
        toast.error("School code must be exactly 6 characters");
        setLoading(false);
        return;
      }

      const schoolType = formData.school_type === "none" ? null : formData.school_type;
      await createSchool({
        code: formData.code,
        name: formData.name,
        region: formData.region,
        zone: formData.zone,
        school_type: schoolType,
      });
      toast.success("School created successfully");
      setFormData({ code: "", name: "", region: "" as SchoolRegion | "", zone: "" as SchoolZone | "", school_type: "none" });
      onSuccess?.();
      onOpenChange(false);
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

  const handleCancel = () => {
    setFormData({ code: "", name: "", region: "" as SchoolRegion | "", zone: "" as SchoolZone | "", school_type: "none" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New School</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new school. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
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
                minLength={6}
                placeholder="Enter 6-character school code"
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                School code must be exactly 6 characters
              </p>
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

            <div className="space-y-2">
              <label htmlFor="school-type" className="text-sm font-medium">
                School Type
              </label>
              <Select
                value={formData.school_type || "none"}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, school_type: value === "none" ? null : (value as "private" | "public") }))
                }
                disabled={loading}
              >
                <SelectTrigger id="school-type" className="w-full">
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
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create School"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
