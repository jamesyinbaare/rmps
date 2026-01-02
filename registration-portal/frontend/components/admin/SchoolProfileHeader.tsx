"use client";

import { Building2 } from "lucide-react";
import type { SchoolDetail } from "@/types";

export function SchoolProfileHeader({ school }: { school: SchoolDetail }) {
  return (
    <div className="flex items-center justify-between border-b pb-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Building2 className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{school.name}</h1>
          <p className="text-muted-foreground">Code: {school.code}</p>
        </div>
      </div>
      <div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
            school.is_active
              ? "bg-[var(--success)]/10 text-[var(--success)]"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {school.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}
