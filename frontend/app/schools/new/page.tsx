"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSchool } from "@/lib/api";
import { toast } from "sonner";

export default function NewSchoolPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createSchool(formData);
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
