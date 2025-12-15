"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProgramme } from "@/lib/api";
import { toast } from "sonner";

export default function NewProgrammePage() {
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
      await createProgramme(formData);
      toast.success("Programme created successfully");
      router.push("/programmes");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create programme");
      console.error("Error creating programme:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <DashboardLayout title="New Programme">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-6 py-4">
          <h1 className="text-lg font-semibold">Create New Programme</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Programme Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="code"
                name="code"
                type="text"
                value={formData.code}
                onChange={handleChange}
                required
                maxLength={50}
                placeholder="Enter programme code"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Programme Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                maxLength={255}
                placeholder="Enter programme name"
                disabled={loading}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Programme"}
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
