"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Documents" subtitle="Download and manage documents" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Documents content will be added here */}
      </div>
    </div>
  );
}
